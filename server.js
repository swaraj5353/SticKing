// server.js
// Backend for the vehicle tattoo/decal customization tool.
// Endpoints:
//   POST /generate-preview  -> fit a described tattoo/decal onto the uploaded
//                              vehicle photo, sized to the given panel dimensions
//   POST /refine-preview    -> take a previously generated preview + a follow-up
//                              instruction ("make it more aggressive", etc.) and
//                              produce an updated version
//   POST /generate-decal    -> generate a standalone, print-ready version of the
//                              design on a transparent background (no vehicle)

const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "15mb" })); // raised limit since refine sends a base64 image back in

// Turns the customer's inputs into one detailed instruction for the AI.
// Keeping this in one place makes it easy to tweak wording later.
function buildPrompt({ part, widthCm, heightCm, description, extra }) {
  const partText = part ? `on the vehicle's ${part}` : "on the vehicle";
  const sizeText =
    widthCm && heightCm
      ? `The design should be sized to fit naturally within an area approximately ${widthCm} cm wide by ${heightCm} cm tall on that panel — proportioned to the panel, not oversized or undersized.`
      : "";

  return [
    `Apply a custom vehicle tattoo/decal design ${partText} in this photo.`,
    `Design: ${description}.`,
    sizeText,
    "Fit the design naturally to the curves, contours, and visible edges of that specific panel, following its shape realistically as if it were printed vinyl applied to the surface.",
    "Keep the rest of the vehicle, lighting, reflections, and background unchanged and photorealistic — this should look like a real photo of a car with a decal applied, not a flat sticker pasted on top.",
    extra ? `Additional instruction: ${extra}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// Generate the first mockup from an uploaded vehicle photo
app.post("/generate-preview", upload.single("vehiclePhoto"), async (req, res) => {
  try {
    const { part, widthCm, heightCm, description } = req.body;

    const image = await toFile(req.file.buffer, req.file.originalname, {
      type: req.file.mimetype,
    });

    const prompt = buildPrompt({ part, widthCm, heightCm, description });

    const result = await openai.images.edit({
      model: "gpt-image-1",
      image,
      prompt,
    });

    const imageBase64 = result.data[0].b64_json;
    res.json({ success: true, image: `data:image/png;base64,${imageBase64}`, promptUsed: prompt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Something went wrong generating the preview." });
  }
});

// Refine an already-generated mockup with a follow-up instruction.
// The client sends back the base64 image it already has, plus the new instruction —
// no server-side session storage needed.
app.post("/refine-preview", async (req, res) => {
  try {
    const { previousImageBase64, part, widthCm, heightCm, description, refinement } = req.body;

    if (!previousImageBase64) {
      return res.status(400).json({ success: false, error: "No previous image supplied to refine." });
    }

    // Strip the "data:image/png;base64," prefix if present
    const base64Data = previousImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const image = await toFile(buffer, "previous-preview.png", { type: "image/png" });

    const prompt = buildPrompt({ part, widthCm, heightCm, description, extra: refinement });

    const result = await openai.images.edit({
      model: "gpt-image-1",
      image,
      prompt,
    });

    const imageBase64 = result.data[0].b64_json;
    res.json({ success: true, image: `data:image/png;base64,${imageBase64}`, promptUsed: prompt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Something went wrong refining the preview." });
  }
});

// Generate a standalone, print-ready decal: just the design, transparent background, no vehicle.
app.post("/generate-decal", async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ success: false, error: "No design description supplied." });
    }

    const prompt = `A standalone vehicle decal/tattoo graphic design: ${description}. Clean vector-style illustration, bold clear outlines, no vehicle, no shadow, no background scene — just the isolated design, suitable for cutting and printing as a vinyl decal.`;

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      background: "transparent",
    });

    const imageBase64 = result.data[0].b64_json;
    res.json({ success: true, image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Something went wrong generating the decal." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

