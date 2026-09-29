const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = process.env.VOYAGE_MODEL || "voyage-4-lite";
const DIM = parseInt(process.env.EMBEDDING_DIM, 10) || 1024;

const isEnabled = () =>
  Boolean(process.env.VOYAGE_API_KEY) && process.env.NODE_ENV !== "test";

/**
 * texts: string[]
 * inputType: "document" when storing jobs, "query" when searching.
 * (Voyage tunes the vector differently for each - improves matching.)
 */
const embed = async (texts, inputType) => {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
      model: MODEL,
      input_type: inputType,
      output_dimension: DIM,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  return (body.data ?? []).map((item) => item.embedding);
};

module.exports = { embed, isEnabled, DIM };
