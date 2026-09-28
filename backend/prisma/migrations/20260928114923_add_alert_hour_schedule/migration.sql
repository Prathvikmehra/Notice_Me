-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "alertDays" TEXT NOT NULL DEFAULT 'weekdays',
ADD COLUMN     "alertHour" INTEGER,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
