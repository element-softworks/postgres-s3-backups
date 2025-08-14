import { exec, execSync } from "node:child_process";
import { createReadStream, statSync, unlink } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	HeadBucketCommand,
	type PutObjectCommandInput,
	S3Client,
	type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { filesize } from "filesize";

import { env } from "./env.js";
import { createMD5 } from "./util.js";
import z from "zod";

const testS3Connection = async (client: S3Client, bucket: string) => {
	try {
		console.log("Testing S3 connection...");
		await client.send(new HeadBucketCommand({ Bucket: bucket }));
		console.log("S3 connection successful - bucket exists and is accessible");
		return true;
	} catch (error: any) {
		console.error("S3 connection test failed:");
		console.error("Error Code:", error.Code);
		console.error("Error Message:", error.message);

		if (error.Code === "NoSuchBucket") {
			console.error("Bucket does not exist or is not accessible");
		} else if (error.Code === "AccessDenied") {
			console.error(
				"Access denied - check your AWS credentials and permissions",
			);
		} else if (error.Code === "MalformedXML") {
			console.error(
				"MalformedXML error suggests the endpoint is not returning proper S3 responses",
			);
			console.error(
				"This often happens with custom endpoints that return HTML error pages",
			);
		}

		return false;
	}
};

const uploadToS3 = async ({ name, path, subfolder }: { name: string; path: string; subfolder: string }) => {
	console.log("Uploading backup to S3...");

	const bucket = env.AWS_S3_BUCKET;

	const clientOptions: S3ClientConfig = {
		region: env.AWS_S3_REGION,
		forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
	};

	if (env.AWS_S3_ENDPOINT) {
		console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`);
		clientOptions.endpoint = env.AWS_S3_ENDPOINT;
	}

	const params: PutObjectCommandInput = {
		Bucket: bucket,
		Key: `${subfolder}/${name}`,
		Body: createReadStream(path),
	};

	if (env.SUPPORT_OBJECT_LOCK) {
		console.log("MD5 hashing file...");

		const md5Hash = await createMD5(path);

		console.log("Done hashing file");

		params.ContentMD5 = Buffer.from(md5Hash, "hex").toString("base64");
	}

	const client = new S3Client(clientOptions);

	// Test connection before upload
	const connectionTest = await testS3Connection(client, bucket);
	if (!connectionTest) {
		throw new Error("S3 connection test failed - cannot proceed with upload");
	}

	try {
		await new Upload({
			client,
			params: params,
		}).done();

		console.log("Backup uploaded to S3...");
	} catch (error: any) {
		console.error("S3 Upload Error Details:");
		console.error("Error Code:", error.Code);
		console.error("Error Message:", error.message);
		console.error("Request ID:", error.$metadata?.requestId);
		console.error("HTTP Status:", error.$metadata?.httpStatusCode);

		// Additional debugging for custom endpoints
		if (env.AWS_S3_ENDPOINT) {
			console.error("Custom endpoint detected - this error often occurs when:");
			console.error("1. The endpoint URL is incorrect");
			console.error(
				"2. The endpoint is returning HTML error pages instead of S3 responses",
			);
			console.error("3. The bucket doesn't exist at this endpoint");
			console.error("4. Authentication is failing at the custom endpoint");
		}

		throw error;
	}
};

const dumpToFile = async (filePath: string) => {
	console.log("Dumping DB to file...");

	await new Promise((resolve, reject) => {
		exec(
			`pg_dump --dbname=${env.BACKUP_DATABASE_URL} --format=tar ${env.BACKUP_OPTIONS} | gzip > ${filePath}`,
			(error, _stdout, stderr) => {
				if (error) {
					reject({ error: error, stderr: stderr.trimEnd() });
					return;
				}

				// check if archive is valid and contains data
				const isValidArchive =
					execSync(`gzip -cd ${filePath} | head -c1`).length === 1;
				if (isValidArchive === false) {
					reject({
						error:
							"Backup archive file is invalid or empty; check for errors above",
					});
					return;
				}

				// not all text in stderr will be a critical error, print the error / warning
				if (stderr !== "") {
					console.log({ stderr: stderr.trimEnd() });
				}

				console.log("Backup archive file is valid");
				console.log("Backup filesize:", filesize(statSync(filePath).size));

				// if stderr contains text, let the user know that it was potently just a warning message
				if (stderr !== "") {
					console.log(
						`Potential warnings detected; Please ensure the backup file "${path.basename(filePath)}" contains all needed data`,
					);
				}

				resolve(undefined);
			},
		);
	});

	console.log("DB dumped to file...");
};

const deleteFile = async (path: string) => {
	console.log("Deleting file...");
	await new Promise((resolve, reject) => {
		unlink(path, (err) => {
			reject({ error: err });
			return;
		});
		resolve(undefined);
	});
};

export const backup = async () => {
	console.log("Initiating DB backup...");

	// Zod schema to transform the environment and project names
	const envSchema = z.object({
		environment: z.enum(["staging", "uat", "prod"]),
		project: z.string().min(1).transform(val =>
			val
				.toLowerCase()
				.replace(/[ /]/g, "-")
				.replace(/[^a-z0-9-]/g, "")
		),
		frequency: z.enum(["daily", "weekly", "monthly"]),
	});

	const { environment, project, frequency } = envSchema.parse({
		environment: env.RAILWAY_ENVIRONMENT_NAME || env.BACKUP_ENV,
		project: env.RAILWAY_PROJECT_NAME || env.BACKUP_PROJECT_NAME,
		frequency: env.BACKUP_FREQUENCY,
	 });

	console.log(`🌐 Environment: ${environment}`);
	console.log(`🏢 Project: ${project}`);
	console.log(`🔄 Frequency: ${frequency}`);

	const date = new Date().toISOString();
	const timestamp = date.replace(/[:.]+/g, "-");
	const filename = `${project}-${environment}-${timestamp}.tar.gz`;
	const filepath = path.join(os.tmpdir(), filename);

	await dumpToFile(filepath);
	await uploadToS3({ name: filename, path: filepath, subfolder: `${project}/${environment}/${frequency}` });
	await deleteFile(filepath);

	console.log("DB backup complete...");
};
