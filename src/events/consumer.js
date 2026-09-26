const { kafka } = require("./producers");
const TOPICS = require("./topics");
const Job = require("../models/Jobs");
const Notification = require("../models/Notification");

const consumer = kafka.consumer({
  groupId: "node-auth-notifications",
});

let isConnected = false;

const STATUS_COPY = {
  UNDER_REVIEW: "is now under review",
  SHORTLISTED: "moved to shortlisted",
  INTERVIEW: "moved to the interview stage",
  OFFERED: "received an offer",
  REJECTED: "was not moved forward",
  WITHDRAWN: "was withdrawn",
};

const buildNotification = async (event) => {
  if (String(event.changedBy) === String(event.applicationId)) return null;

  const job = await Job.findById(event.jobId).select("title");
  const jobTitle = job?.title ?? "a job";
  const copy = STATUS_COPY[event.status] ?? `changed to ${event.status}`;

  return {
    recipient: event.applicationId,
    type: "APPLICATION_STATUS_CHANGED",
    title: "Application update",
    message: `Your application for ${jobTitle} ${copy}`,
    data: {
      applicationId: event.applicationId,
      jobId: event.jobId,
      status: event.status,
    },
  };
};

const handleMessage = async ({ message }) => {
  if (!message.value) return;

  let event;

  try {
    event = JSON.parse(message.value.toString());
  } catch {
    console.warn("Notification consumer: dropped an unparseable message.");
    return;
  }

  if (event.type !== "application.status_changed") return;

  try {
    const doc = await buildNotification(event);
    if (doc) await Notification.create(doc);
  } catch (error) {
    console.error("Notification consumer failed on one event:", error.message);
  }
};

const connectConsumer = async () => {
  if (isConnected) return;
  try {
    await consumer.connect();
    await consumer.subscribe({
      topic: TOPICS.APPLICATION_EVENTS,
      fromBeginning: false,
    });
    await consumer.run({
      eachMessage: handleMessage,
    });

    isConnected = true;
    console.log("Kafka notification consumer connected and running.");
  } catch (error) {
    console.warn(
      `Kafka consumer could not connect (${error.message}).Continuing without it -- no in-app notifications will be created.`,
    );
  }
};

const disConnectConsumer = async () => {
  if (!isConnected) return;
  await consumer.disconnect();
  isConnected = false;
};

module.exports = { connectConsumer, disConnectConsumer };
