import { openai } from "@ai-sdk/openai";
import { type CoreMessage, generateText, streamText, tool } from "ai";
import dotenv from "dotenv";
import { z } from "zod";
import moment from "moment-timezone";
import { db } from "./config/database";

dotenv.config();

const messages: CoreMessage[] = [];

export async function checkAndRemindTasks(userInput: string) {
	// const persons = ["daffa", "mba_nur", "bu_malihah", "pak_ari"] as const;

	const result = await generateText({
		model: openai("gpt-4o-mini"),
		system: `
			# Waktu
			Gunakan waktu sekarang untuk menentukan waktu yang sesuai untuk setiap tugas (import moment from "moment-timezone";)

			# Database
			database yang kamu gunakan sebagai referensi adalah:
			create table persons
			create table todolist
			(
				id           int auto_increment
					primary key,
				todo         varchar(255) null,
				person_id    varchar(255) null,
				created_at   datetime     null,
				due_date     datetime     null,
				completed_at datetime     null,
				is_completed tinyint(1)   null
			);

			# Output yang diharapkan
			Output yang diharapkan adalah sebuah text whatsapp yang menjelaskan tugas yang sudah ditugaskan kepadanya, dengan sopan

			Contoh:
			[nama], apakah ada kendala dengan tugas ini [tugas] ....
			[nama], bagaimana proses dengan tugas ini [tugas] ....
			[nama], tugas ini [tugas] kira kira akan selesai kapan ....
			[nama], ada yang bisa saya bantu dengan tugas ini [tugas] ....
			[nama], tugas ini [tugas] sudah selesai belum ....
			`,
		prompt: userInput,
		tools: {
			getCurrentTime: tool({
				description: "Get the current time",
				parameters: z.object({}),
				execute: async () => {
					return moment().tz("Asia/Jakarta", true).add(7, "hours").toDate();
				},
			}),
			getDaffaTodo: tool({
				description: "Get the daffa todolist from the database",
				parameters: z.object({}),
				execute: async () => {
					try {
						const result = await db
							.select("*")
							.from("todolist")
							.where("person_id", "daffa");
						if (result.length === 0) {
							return "Tidak ada hasil dari query ini";
						}
						return result;
					} catch (error) {
						return "Error executing database query";
					}
				},
			}),
			getMbaNurTodo: tool({
				description: "Get the mba nur todolist from the database",
				parameters: z.object({}),
				execute: async () => {
					try {
						const result = await db
							.select("*")
							.from("todolist")
							.where("person_id", "mba_nur");
						if (result.length === 0) {
							return "Tidak ada hasil dari query ini";
						}
						return result;
					} catch (error) {
						return "Error executing database query";
					}
				},
			}),
			getHerlinTodo: tool({
				description: "Get the herlin todolist from the database",
				parameters: z.object({}),
				execute: async () => {
					try {
						const result = await db
							.select("*")
							.from("todolist")
							.where("person_id", "bu_herlin");
						if (result.length === 0) {
							return "Tidak ada hasil dari query ini";
						}
						return result;
					} catch (error) {
						return "Error executing database query";
					}
				},
			}),
			getMalihahTodo: tool({
				description: "Get the malihah todolist from the database",
				parameters: z.object({}),
				execute: async () => {
					try {
						const result = await db
							.select("*")
							.from("todolist")
							.where("person_id", "bu_malihah");
						if (result.length === 0) {
							return "Tidak ada hasil dari query ini";
						}
						return result;
					} catch (error) {
						return "Error executing database query";
					}
				},
			}),
			getPakAriTodo: tool({
				description: "Get the pak ari todolist from the database",
				parameters: z.object({}),
				execute: async () => {
					try {
						const result = await db
							.select("*")
							.from("todolist")
							.where("person_id", "pak_ari");
						if (result.length === 0) {
							return "Tidak ada hasil dari query ini";
						}
						return result;
					} catch (error) {
						return "Error executing database query";
					}
				},
			}),
		},
		maxSteps: 5,
	});

	return result.text;
}
