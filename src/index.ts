import { Client, LocalAuth, type Message } from "whatsapp-web.js";
import { openai } from "@ai-sdk/openai";
import {
	generateText,
	type CoreMessage,
	type CoreSystemMessage,
	type CoreUserMessage,
	type CoreAssistantMessage,
	tool,
} from "ai";
import { db } from "./config/database";
import { systemPrompt } from "./config/prompt";
import moment from "moment-timezone";
import { z } from "zod";
import { checkAndRemindTasks } from "./reminder";

interface ChatData {
	phone_number: string;
	message: string;
	response: string;
	created_at: Date;
	is_sent: boolean;
	error_message?: string;
}

class WhatsAppService {
	private client: Client;
	private readyCallback?: () => Promise<void>;
	private readonly MAX_HISTORY = 5;
	private scheduledTasks: Map<string, unknown> = new Map();

	constructor() {
		this.client = new Client({
			authStrategy: new LocalAuth(),
			puppeteer: {
				headless: true,
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
				],
			},
		});

		this.setupEventHandlers();
		this.setupScheduledMessages();
	}

	private setupEventHandlers() {
		this.client.on("loading_screen", (percent, message) => {
			console.log("LOADING SCREEN", percent, message);
		});

		this.client.on("qr", (qr) => {
			console.log("QR Code received. Scan with WhatsApp:");
			require("qrcode-terminal").generate(qr, { small: true });
		});

		this.client.on("ready", async () => {
			const info = await this.client.info;
			if (info) {
				console.log(`Phone number: ${info.wid.user}`);
			}
			console.log("Client is ready to send messages!");
			if (this.readyCallback) {
				this.readyCallback().catch((error) => {
					console.error("Error in ready callback:", error);
				});
			}
		});

		this.client.on("authenticated", () => {
			console.log("Authenticated successfully!");
		});

		this.client.on("auth_failure", (msg) => {
			console.error("Authentication failed:", msg);
		});

		this.client.on("disconnected", (reason) => {
			console.log("Client was disconnected", reason);
		});

		// AI Message Handler
		this.client.on("message", async (message: Message) => {
			if (message.fromMe) return;

			const isCalled = message.body.toLowerCase().includes("wulang");
			if (!isCalled) return;

			// console.log("Group ID:", message.from);
			// console.log("Group Name:", (await message.getChat()).name);

			// Get the actual sender ID from group message
			const senderId = message.author || message.from;
			const phoneNumber = senderId.split("@")[0].split("-")[0];

			const isAllowedNumber =
				phoneNumber.includes("81235581851") ||
				phoneNumber.includes("85712208535") ||
				phoneNumber.includes("82323363406") ||
				phoneNumber.includes("81330326382");
			if (!isAllowedNumber) return;

			if (isCalled && isAllowedNumber) {
				await this.handleMessage(message);
			}
		});
	}

	private async handleMessage(message: Message) {
		const chatData: Partial<ChatData> = {
			phone_number: message.from,
			message: message.body,
			created_at: new Date(),
			is_sent: false,
		};

		try {
			console.log(`Received message from ${message.from}`);

			// Build conversation context with history
			const messages = await this.buildConversationContext(
				message.from,
				message.body,
			);

			// Generate AI response
			const { text: response } = await generateText({
				model: openai("gpt-4o-mini"),
				messages,
				tools: {
					getCurrentTime: tool({
						description: "Get the current time",
						parameters: z.object({}),
						execute: async () => {
							return moment().tz("Asia/Jakarta", true).add(7, "hours").toDate();
						},
					}),
					dbQuery: tool({
						description:
							"Execute a query to the database based on user request",
						parameters: z.object({
							query: z
								.string()
								.describe(
									"The query to execute using knexjs syntax db.raw(query)",
								),
						}),
						execute: async ({ query }) => {
							try {
								const result = await db.raw(query);
								return result || "No result";
							} catch (error) {
								return "Error executing database query";
							}
						},
					}),
				},
				maxSteps: 5,
				onStepFinish: (step) => {
					// console.log(JSON.stringify(step, null, 2));
				},
			});

			// Send response
			await message.reply(response);
			// console.log(`Sent response to ${message.from}: ${response}`);

			// Update chat data
			chatData.response = response;
			chatData.is_sent = true;

			// Save to database
			await this.saveChat(chatData as ChatData);
		} catch (error) {
			console.error("Error handling message:", error);
			chatData.error_message =
				error instanceof Error ? error.message : "Unknown error";
			chatData.is_sent = false;

			if (chatData.message) {
				await this.saveChat(chatData as ChatData);
			}

			try {
				await message.reply(
					"Maaf, terjadi kesalahan saat memproses pesan Anda. Silakan coba lagi nanti.",
				);
			} catch (replyError) {
				console.error("Error sending error message:", replyError);
			}
		}
	}

	private async saveChat(chatData: ChatData) {
		try {
			if (!chatData.phone_number || !chatData.message) {
				throw new Error("Missing required chat data");
			}

			await db("chats").insert({
				phone_number: chatData.phone_number,
				message: chatData.message,
				response: chatData.response || null,
				created_at: chatData.created_at,
				is_sent: chatData.is_sent,
				error_message: chatData.error_message,
			});
		} catch (error) {
			console.error("Error saving chat to database:", error);
		}
	}

	private async getChatHistory(phoneNumber: string): Promise<ChatData[]> {
		try {
			const history = await db("chats")
				.where({
					phone_number: phoneNumber,
					is_sent: true,
				})
				.orderBy("created_at", "desc")
				.limit(this.MAX_HISTORY)
				.select();

			return history.reverse();
		} catch (error) {
			console.error("Error fetching chat history:", error);
			return [];
		}
	}

	private async buildConversationContext(
		phoneNumber: string,
		currentMessage: string,
	): Promise<CoreMessage[]> {
		const history = await this.getChatHistory(phoneNumber);
		const messages: CoreMessage[] = [];

		// Add system message with proper typing
		const systemMessage: CoreSystemMessage = {
			role: "system",
			content: systemPrompt,
		};
		messages.push(systemMessage);

		for (const chat of history) {
			const userMessage: CoreUserMessage = {
				role: "user",
				content: chat.message,
			};
			const assistantMessage: CoreAssistantMessage = {
				role: "assistant",
				content: chat.response,
			};
			messages.push(userMessage, assistantMessage);
		}

		const finalUserMessage: CoreUserMessage = {
			role: "user",
			content: currentMessage,
		};
		messages.push(finalUserMessage);

		return messages;
	}

	public onReady(callback: () => Promise<void>) {
		this.readyCallback = callback;
	}

	public async initialize() {
		try {
			await this.client.initialize();
		} catch (error) {
			console.error("Failed to initialize WhatsApp client:", error);
			process.exit(1);
		}
	}

	private async setupScheduledMessages() {
		const cron = require("node-cron");

		// Example: Send daily reminder at 9 AM Jakarta time
		cron.schedule(
			"0 */2 * * *",
			async () => {
				try {
					const groupId = "120363365218296529@g.us";
					const chat = await this.client.getChatById(groupId);
					if (chat) {
						const reminderMessageOne = await checkAndRemindTasks(
							"tolong mengingatkan mbak nur untuk melakukan tugas, dalam 1 paragraf",
						);
						await chat.sendMessage(reminderMessageOne);
						await new Promise((resolve) => setTimeout(resolve, 120 * 1000));
						const reminderMessageTwo = await checkAndRemindTasks(
							"tolong mengingatkan daffa untuk melakukan tugas, dalam 1 paragraf",
						);
						await chat.sendMessage(reminderMessageTwo);
						await new Promise((resolve) => setTimeout(resolve, 360 * 1000));
						const reminderMessageThree = await checkAndRemindTasks(
							"tolong mengingatkan bu malihah untuk melakukan tugas, dalam 1 paragraf",
						);
						await chat.sendMessage(reminderMessageThree);
					}
				} catch (error) {
					console.error("Error sending scheduled message:", error);
				}
			},
			{
				timezone: "Asia/Jakarta",
			},
		);

		// You can add more scheduled tasks here
	}
}

const whatsappService = new WhatsAppService();

whatsappService.onReady(async () => {
	console.log("WhatsApp service is ready to use!");
});

process.on("SIGINT", async () => {
	console.log("Shutting down...");
	process.exit(0);
});

async function startWhatsAppService() {
	try {
		await whatsappService.initialize();
	} catch (error) {
		console.error("Failed to initialize WhatsApp service:", error);
		process.exit(1);
	}
}

startWhatsAppService();
