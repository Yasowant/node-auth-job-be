const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "node-auth-job-be",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});

const producer = kafka.producer();

let isConnected = false;

const connectProducer = async () => {
  if (isConnected) return;

  await producer.connect();
  isConnected = true;
  console.log("Kafka producer connected");
};

const disconnectProducer = async () => {
  if (!isConnected) return;

  await producer.disconnect();
  isConnected = false;
};

/**
 * Publish one event onto a topic. `key` (optional) keeps related events -
 * e.g. every event for the same applicationId - ordered on one partition.
 */
const publishEvent = async (topic, payload, key) => {
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
