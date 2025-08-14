import { CronJob } from "cron";
import { backup } from "./backup.js";

console.log(`NodeJS Version: ${process.version}`);

const tryBackup = async () => {
	try {
		await backup();
	} catch (error) {
		console.error("Error while running backup: ", error);
		process.exit(1);
	}
};

if (process.env.RUN_ON_STARTUP || process.env.SINGLE_SHOT_MODE) {
	console.log("Running on start backup...");

	await tryBackup();

	if (process.env.SINGLE_SHOT_MODE) {
		console.log("Database backup complete, exiting...");
		process.exit(0);
	}
}

const job = new CronJob(process.env.BACKUP_CRON_SCHEDULE || "0 0 * * *", async () => {
	await tryBackup();
});

job.start();

console.log("Backup cron scheduled...");
