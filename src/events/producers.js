const fs = require("fs");
const path = require("path");
const { Kafka, Partitioners } = require("kafkajs");

// Local dev (Docker Kafka): only KAFKA_BROKER is set (or nothing, defaults
// to localhost:9092) - plain PLAINTEXT, no auth.
// Production (Aiven Kafka, free tier): KAFKA_BROKER + KAFKA_USERNAME +
// KAFKA_PASSWORD are set as Render env vars - SASL_SSL, authenticated,
// verified against Aiven's CA certificate checked into this repo (it's a
// public certificate, not a secret - it only lets us verify the server,
// it grants no access on its own).
const useSasl = Boolean(
  process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD,
);

const kafkaConfig = {
  clientId: "node-auth-job-be",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
  retry: {
    retries: 2,
  },
};

if (useSasl) {
  kafkaConfig.ssl = {
    ca: [
      fs.readFileSync(
        path.join(__dirname, "..", "config", "certs", "aiven-kafka-ca.pem"),
        "utf-8",
      ),
    ],
  };
  kafkaConfig.sasl = {
    mechanism: "scram-sha-256",
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  };
}

const kafka = new Kafka(kafkaConfig);

// Explicit, not the implicit default -- this is a fresh app with no
// old partitioning to stay compatible with, so there's no reason to
// reach for the legacy partitioner. Passing this instead of leaving it
// unset is what stops KafkaJS's own "you're relying on our default"
// warning from firing on every producer.connect().
const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

let isConnected = false;

// Kafka is a local learning add-on for this project. In production
// (Render) it now points at a free Aiven Kafka cluster over SASL_SSL, but
// if that's ever unreachable or unset, we log a warning and keep the
// server running instead of crashing on startup - the REST API + MongoDB
// work fine without it either way.
const connectProducer = async () => {
  if (isConnected) return;

  try {
    await producer.connect();
    isConnected = true;
    console.log(
      `Kafka producer connected (${useSasl ? "SASL_SSL - Aiven" : "PLAINTEXT - local"})`,
    );
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
 * applyToJob never fail a real request just because Kafka is unavailable
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
