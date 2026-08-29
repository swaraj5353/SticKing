const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();

const PORT = process.env.PORT || 10000;

/* =========================================================
   OPENAI
   ========================================================= */

const openaiConfigured = !!process.env.OPENAI_API_KEY;

if (openaiConfigured) {
  console.log("✅ OPENAI_API_KEY is configured.");
} else {
  console.log("❌ OPENAI_API_KEY is NOT configured.");
}

const openai = openaiConfigured
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;


/* =========================================================
   CORS
   ========================================================= */

app.use((req, res, next) => {
  const origin = req.headers.origin;

  const allowedOrigins = [
    "https://sticking.odoo.com",
    "https://www.sticking.odoo.com",
    "https://sticking.onrender.com"
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  if (req.method === "OPTIONS") {
    console.log("➡️ OPTIONS", req.path);
    return res.status(204).end();
  }

  next();
});


/* =========================================================
   BODY PARSING
   ========================================================= */

app.use(express.json({ limit: "10mb" }));


/* =========================================================
   FILE UPLOAD
   ========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});


/* =========================================================
   REQUEST LOGGER
   ========================================================= */

app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.path}`);
  next();
});


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "SticKing AI Vehicle Customizer",
    status: "running",
    openaiConfigured: openaiConfigured
  });
});


/* =========================================================
   HOME
   ========================================================= */

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});


/* =========================================================
   GENERATE VEHICLE PREVIEW
   ========================================================= */

app.post(
  "/generate-preview",
  upload.single("vehicleImage"),
  async (req, res) => {

    console.log("==========================================");
    console.log("🚗 GENERATE PREVIEW REQUEST RECEIVED");
    console.log("==========================================");

    try {

      /* -----------------------------------------------------
         CHECK OPENAI
         ----------------------------------------------------- */

      if (!openaiConfigured || !openai) {
        console.log("❌ OpenAI API key is missing.");

        return res.status(500).json({
          ok: false,
          error: "OpenAI API key is not configured on the server."
        });
      }


      /* -----------------------------------------------------
         CHECK IMAGE
         ----------------------------------------------------- */

      if (!req.file) {
        console.log("❌ No vehicle image received.");

        return res.status(400).json({
          ok: false,
          error: "No vehicle image was uploaded."
        });
      }

      console.log(
        "📷 Image received:",
        req.file.originalname
      );

      console.log(
        "📦 Image size:",
        req.file.size,
        "bytes"
      );

      console.log(
        "🖼️ Image type:",
        req.file.mimetype
      );


      /* -----------------------------------------------------
         FORM DATA
         ----------------------------------------------------- */

      const design = req.body.design || "";
      const width = req.body.width || "";
      const height = req.body.height || "";
      const description = req.body.description || "";

      console.log("🎨 Design:", design);
      console.log("📏 Width:", width);
      console.log("📐 Height:", height);
      console.log("📝 Description:", description);


      /* -----------------------------------------------------
         PROMPT
         ----------------------------------------------------- */

      const prompt = `
You are a professional vehicle sticker and vinyl wrap designer.

Create a realistic visual preview of the uploaded vehicle with the
requested sticker/design applied to the vehicle.

IMPORTANT:
- Keep the original vehicle recognizable.
- Keep the vehicle model, proportions, body shape and perspective.
- Do not redesign or replace the vehicle.
- Apply the sticker naturally to the visible vehicle surface.
- Make the sticker look like professionally installed vinyl.
- Follow the vehicle's curves and panels.
- Preserve realistic lighting, shadows and reflections.
- The sticker should look physically attached to the vehicle.
- Do not place the sticker floating beside the vehicle.
- Do not change the background unnecessarily.

Sticker/design:
${design}

Requested dimensions:
Width: ${width} cm
Height: ${height} cm

Additional customer instructions:
${description}

Generate a high-quality realistic vehicle customization preview.
`;


      console.log("🧠 Prompt created.");
      console.log("🤖 Sending request to OpenAI image generation...");


      /* -----------------------------------------------------
         OPENAI IMAGE GENERATION
         ----------------------------------------------------- */

      const imageResponse = await openai.images.edit({
        model: "gpt-image-1",

        image: {
          data: req.file.buffer,
          filename: req.file.originalname
        },

        prompt: prompt,

        size: "1024x1024"
      });


      console.log("✅ OpenAI response received.");


      /* -----------------------------------------------------
         GET GENERATED IMAGE
         ----------------------------------------------------- */

      if (
        !imageResponse ||
        !imageResponse.data ||
        !imageResponse.data[0]
      ) {
        console.log("❌ OpenAI returned no image.");

        return res.status(500).json({
          ok: false,
          error: "OpenAI did not return an image."
        });
      }


      const result = imageResponse.data[0];


      /* -----------------------------------------------------
         BASE64 IMAGE
         ----------------------------------------------------- */

      if (result.b64_json) {

        console.log("🖼️ Base64 image received.");

        return res.json({
          ok: true,
          image: `data:image/png;base64,${result.b64_json}`
        });
      }


      /* -----------------------------------------------------
         URL IMAGE
         ----------------------------------------------------- */

      if (result.url) {

        console.log("🔗 Image URL received.");

        return res.json({
          ok: true,
          image: result.url
        });
      }


      /* -----------------------------------------------------
         UNKNOWN RESPONSE
         ----------------------------------------------------- */

      console.log(
        "❌ OpenAI response did not contain b64_json or url."
      );

      return res.status(500).json({
        ok: false,
        error: "Unexpected OpenAI image response."
      });

    } catch (error) {

      console.error("==========================================");
      console.error("❌ GENERATE PREVIEW FAILED");
      console.error("==========================================");

      console.error("Error name:", error.name);
      console.error("Error message:", error.message);

      if (error.status) {
        console.error("OpenAI status:", error.status);
      }

      if (error.code) {
        console.error("OpenAI code:", error.code);
      }

      if (error.response) {
        console.error("OpenAI response:", error.response);
      }

      console.error(error);

      return res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Image generation failed."
      });
    }
  }
);


/* =========================================================
   404
   ========================================================= */

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
    path: req.path
  });
});


/* =========================================================
   GLOBAL ERROR HANDLER
   ========================================================= */

app.use((error, req, res, next) => {

  console.error("❌ GLOBAL SERVER ERROR");
  console.error(error);

  res.status(500).json({
    ok: false,
    error: error.message || "Server error"
  });
});


/* =========================================================
   START SERVER
   ========================================================= */

app.listen(PORT, "0.0.0.0", () => {

  console.log("==========================================");
  console.log("🚀 SticKing server started");
  console.log(`🌐 http://0.0.0.0:${PORT}`);
  console.log(`🔑 OpenAI configured: ${openaiConfigured}`);
  console.log("==========================================");

});
