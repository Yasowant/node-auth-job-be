const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "node-auth-job-be",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
  retry: {
    retries: 2,
  },
});

const producer = kafka.producer();

let isConnected = false;

// Kafka is a local learning add-on for this project - it isn't deployed
// anywhere in production (e.g. Render). If there's no broker reachable,
// we log a warning and keep the server running instead of crashing on
// startup - the REST API + MongoDB work fine without it.
const connectProducer = async () => {
  if (isConnected) return;

  try {
    await producer.connect();
    isConnected = true;
    console.log("Kafka producer connected");
  } catch (error) {
    console.warn(
      `Kafka producer could not connect (${error.message}). Continuing without Kafka - application events will not be published.`,
    );
  }
};

const disconnectProducer = async () => {
  if (!isConnected) return;

  await producer.disconnect();
  isConnected = false;
};

/**
 * Publish one event onto a topic. `key` (optional) keeps related events -
 * e.g. every event for the same applicationId - ordered on one partition.
 * No-ops (with a warning) if Kafka isn't connected, so callers like
 * applyToJob never fail a real request just because Kafka is unavailable.
 */
const publishEvent = async (topic, payload, key) => {
  if (!isConnected) {
    console.warn(`Kafka not connected - skipping event publish to "${topic}".`);
    return;
  }

  await producer.send({
    topic,
    messages: [
      {
        key: key ? String(key) : undefined,
        value: JSON.stringify(payload),
      },
    ],
  });
};

module.exports = { connectProducer, disconnectProducer, publishEvent };
