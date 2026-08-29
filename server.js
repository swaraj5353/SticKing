const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { toFile } = require("openai");

const app = express();

const PORT = process.env.PORT || 10000;

// ======================================================
// OPENAI
// ======================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is NOT configured.");
} else {
  console.log("✅ OPENAI_API_KEY is configured.");
}

const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY
    })
  : null;

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ======================================================
// STATIC WEBSITE
// ======================================================

const publicPath = path.join(__dirname, "public");

app.use(express.static(publicPath));

// ======================================================
// MULTER
// ======================================================

// Store uploaded image in memory.
// This avoids temporary-file/path problems on Render.

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    console.log("📁 Uploaded file:", file.originalname);
    console.log("📁 MIME type:", file.mimetype);

    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }

    cb(null, true);
  }
});

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "SticKing AI Vehicle Customizer",
    status: "running",
    openaiConfigured: !!OPENAI_API_KEY
  });
});

// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// ======================================================
// AI PREVIEW
// ======================================================

app.post("/api/generate-preview", upload.single("image"), async (req, res) => {

  console.log("");
  console.log("==========================================");
  console.log("🚀 GENERATE PREVIEW REQUEST RECEIVED");
  console.log("==========================================");

  try {

    // --------------------------------------------------
    // CHECK OPENAI
    // --------------------------------------------------

    if (!openai) {

      console.error("❌ OPENAI_API_KEY is missing.");

      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY is not configured on the server."
      });
    }

    // --------------------------------------------------
    // CHECK IMAGE
    // --------------------------------------------------

    if (!req.file) {

      console.error("❌ No image received.");

      return res.status(400).json({
        success: false,
        error: "No vehicle image was uploaded."
      });
    }

    console.log("✅ Image received.");
    console.log("   Filename:", req.file.originalname);
    console.log("   MIME:", req.file.mimetype);
    console.log("   Size:", req.file.size, "bytes");

    // --------------------------------------------------
    // FORM DATA
    // --------------------------------------------------

    const part = req.body.part || "vehicle";
    const width = req.body.width || "";
    const height = req.body.height || "";
    const design = req.body.design || "custom vehicle decal";
    const instructions = req.body.instructions || "";

    console.log("🚗 Vehicle part:", part);
    console.log("📏 Width:", width);
    console.log("📏 Height:", height);
    console.log("🎨 Design:", design);
    console.log("📝 Instructions:", instructions);

    // --------------------------------------------------
    // CREATE PROMPT
    // --------------------------------------------------

    const prompt = `
Edit the uploaded vehicle photograph.

Create a highly realistic professional preview of a vinyl sticker / decal
design applied ONLY to the selected vehicle area.

Vehicle area:
${part}

Requested design:
${design}

Additional instructions:
${instructions || "Make the design premium, realistic and professionally fitted."}

Physical size:
${width ? width + " cm" : "not specified"} wide
${height ? height + " cm" : "not specified"} high

IMPORTANT:
- Keep the original vehicle.
- Keep the vehicle's shape, proportions, lights, windows and body panels unchanged.
- Do not redesign or replace the vehicle.
- Apply the decal naturally to the vehicle surface.
- Follow the vehicle's perspective and curvature.
- Make the sticker look physically printed and professionally installed.
- Preserve realistic reflections and lighting.
- Do not put the design outside the vehicle.
- Do not change the background unnecessarily.
- Do not add text unless specifically requested.
- Produce a photorealistic result.
`;

    console.log("------------------------------------------");
    console.log("🧠 PROMPT SENT TO OPENAI:");
    console.log(prompt);
    console.log("------------------------------------------");

    // --------------------------------------------------
    // CONVERT BUFFER TO A REAL UPLOADABLE FILE
    // --------------------------------------------------

    console.log("🔄 Preparing image for OpenAI...");

    const imageFile = await toFile(
      req.file.buffer,
      req.file.originalname || "vehicle.png",
      {
        type: req.file.mimetype || "image/png"
      }
    );

    console.log("✅ Image converted to OpenAI upload file.");

    // --------------------------------------------------
    // CALL OPENAI IMAGE EDIT
    // --------------------------------------------------

    console.log("🎨 Sending image to OpenAI...");
    console.log("⏳ Please wait...");

    const result = await openai.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: prompt,
      size: "1024x1024",
      n: 1
    });

    console.log("✅ OpenAI response received.");

    // --------------------------------------------------
    // CHECK RESPONSE
    // --------------------------------------------------

    if (!result || !result.data || !result.data.length) {

      console.error("❌ OpenAI returned no image.");

      return res.status(500).json({
        success: false,
        error: "OpenAI did not return an image."
      });
    }

    const generatedImage = result.data[0];

    // --------------------------------------------------
    // BASE64 IMAGE
    // --------------------------------------------------

    if (generatedImage.b64_json) {

      console.log("✅ Generated image received as base64.");

      const imageData = generatedImage.b64_json;

      const imageUrl = `data:image/png;base64,${imageData}`;

      console.log("✅ Sending generated image to browser.");

      return res.json({
        success: true,
        image: imageUrl
      });
    }

    // --------------------------------------------------
    // URL FALLBACK
    // --------------------------------------------------

    if (generatedImage.url) {

      console.log("✅ Generated image URL received.");

      return res.json({
        success: true,
        image: generatedImage.url
      });
    }

    // --------------------------------------------------
    // NO IMAGE
    // --------------------------------------------------

    console.error("❌ OpenAI response did not contain b64_json or url.");

    return res.status(500).json({
      success: false,
      error: "OpenAI returned an unexpected image response."
    });

  } catch (error) {

    console.error("");
    console.error("==========================================");
    console.error("❌ GENERATE PREVIEW ERROR");
    console.error("==========================================");

    console.error("Message:", error.message);

    if (error.status) {
      console.error("HTTP status:", error.status);
    }

    if (error.code) {
      console.error("Error code:", error.code);
    }

    if (error.param) {
      console.error("Error parameter:", error.param);
    }

    if (error.type) {
      console.error("Error type:", error.type);
    }

    if (error.response) {
      console.error("Response:", error.response);
    }

    console.error("Full error:");
    console.error(error);

    console.error("==========================================");

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || "Image generation failed."
    });
  }
});

// ======================================================
// MULTER / UPLOAD ERROR HANDLER
// ======================================================

app.use((error, req, res, next) => {

  console.error("==========================================");
  console.error("❌ SERVER ERROR");
  console.error("==========================================");
  console.error(error);

  if (error instanceof multer.MulterError) {

    return res.status(400).json({
      success: false,
      error: `Upload error: ${error.message}`
    });
  }

  return res.status(500).json({
    success: false,
    error: error.message || "Server error."
  });
});

// ======================================================
// 404
// ======================================================

app.use((req, res) => {

  res.status(404).json({
    success: false,
    error: "Endpoint not found."
  });
});

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, "0.0.0.0", () => {

  console.log("");
  console.log("==========================================");
  console.log("🚀 SticKing server started");
  console.log(`🌐 http://0.0.0.0:${PORT}`);
  console.log(`🔑 OpenAI configured: ${!!OPENAI_API_KEY}`);
  console.log("==========================================");
});
