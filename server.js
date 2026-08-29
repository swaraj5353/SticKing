const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================================================
   OPENAI
========================================================= */

const openaiConfigured = !!process.env.OPENAI_API_KEY;

const openai = openaiConfigured
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

console.log(
  openaiConfigured
    ? "✅ OPENAI_API_KEY is configured."
    : "❌ OPENAI_API_KEY is NOT configured."
);

/* =========================================================
   CORS
   IMPORTANT FOR ODOO EMBED
========================================================= */

app.use((req, res, next) => {
  const origin = req.headers.origin;

  console.log("🌍 Request origin:", origin || "none");

  // Allow the Odoo website, Render itself,
  // and other browser origins used for embedding.
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  if (req.method === "OPTIONS") {
    console.log("➡️ CORS OPTIONS:", req.path);
    return res.status(204).end();
  }

  next();
});

/* =========================================================
   BODY PARSER
========================================================= */

app.use(
  express.json({
    limit: "10mb"
  })
);

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
  console.log(
    `➡️ ${req.method} ${req.path}`
  );

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
  res.sendFile(
    __dirname + "/public/index.html"
  );
});

/* =========================================================
   GENERATE VEHICLE PREVIEW
========================================================= */

app.post(
  "/generate-preview",
  upload.single("vehicleImage"),

  async (req, res) => {

    console.log("");
    console.log("==========================================");
    console.log("🚗 GENERATE PREVIEW REQUEST RECEIVED");
    console.log("==========================================");

    try {

      /* -----------------------------------------------------
         CHECK OPENAI
      ----------------------------------------------------- */

      if (!openaiConfigured || !openai) {

        console.log(
          "❌ OpenAI API key is missing."
        );

        return res.status(500).json({
          ok: false,
          error:
            "OpenAI API key is not configured on the server."
        });
      }

      /* -----------------------------------------------------
         CHECK IMAGE
      ----------------------------------------------------- */

      if (!req.file) {

        console.log(
          "❌ No vehicle image received."
        );

        return res.status(400).json({
          ok: false,
          error:
            "No vehicle image was uploaded."
        });
      }

      console.log(
        "📷 Image:",
        req.file.originalname
      );

      console.log(
        "📦 Size:",
        req.file.size,
        "bytes"
      );

      console.log(
        "🖼️ Type:",
        req.file.mimetype
      );

      /* -----------------------------------------------------
         FORM DATA
      ----------------------------------------------------- */

      const design =
        req.body.design || "";

      const width =
        req.body.width || "";

      const height =
        req.body.height || "";

      const description =
        req.body.description || "";

      console.log(
        "🎨 Design:",
        design
      );

      console.log(
        "📏 Width:",
        width
      );

      console.log(
        "📐 Height:",
        height
      );

      console.log(
        "📝 Description:",
        description
      );

      /* -----------------------------------------------------
         PROMPT
      ----------------------------------------------------- */

      const prompt = `
You are a professional automotive vinyl sticker designer.

Create a realistic preview of the uploaded vehicle with
the requested sticker/design applied naturally to the
vehicle.

IMPORTANT:

- Keep the original vehicle recognizable.
- Keep the same vehicle model.
- Keep the original body shape.
- Keep the original perspective.
- Do not replace the vehicle.
- Do not redesign the vehicle.
- Apply the design directly onto the requested vehicle surface.
- Make the sticker look like professionally installed vinyl.
- Follow the curves of the vehicle.
- Preserve realistic lighting.
- Preserve realistic shadows.
- Preserve reflections.
- Do not place the design floating outside the vehicle.
- Do not unnecessarily change the background.

Requested sticker/design:

${design}

Vehicle part:

${description}

Requested dimensions:

Width: ${width} cm
Height: ${height} cm

Generate a high-quality realistic vehicle customization preview.
`;

      console.log(
        "🧠 Prompt created."
      );

      console.log(
        "🤖 Sending request to OpenAI..."
      );

      /* -----------------------------------------------------
         OPENAI IMAGE EDIT
      ----------------------------------------------------- */

      const imageResponse =
        await openai.images.edit({

          model: "gpt-image-1",

          image: {
            data: req.file.buffer,
            filename: req.file.originalname
          },

          prompt: prompt,

          size: "1024x1024"
        });

      console.log(
        "✅ OpenAI response received."
      );

      /* -----------------------------------------------------
         CHECK RESPONSE
      ----------------------------------------------------- */

      if (
        !imageResponse ||
        !imageResponse.data ||
        !imageResponse.data[0]
      ) {

        console.log(
          "❌ OpenAI returned no image."
        );

        return res.status(500).json({
          ok: false,
          error:
            "OpenAI did not return an image."
        });
      }

      const result =
        imageResponse.data[0];

      /* -----------------------------------------------------
         BASE64
      ----------------------------------------------------- */

      if (result.b64_json) {

        console.log(
          "🖼️ Base64 image received."
        );

        return res.json({

          ok: true,

          image:
            "data:image/png;base64," +
            result.b64_json

        });
      }

      /* -----------------------------------------------------
         URL
      ----------------------------------------------------- */

      if (result.url) {

        console.log(
          "🔗 Image URL received."
        );

        return res.json({

          ok: true,

          image: result.url

        });
      }

      /* -----------------------------------------------------
         UNKNOWN RESPONSE
      ----------------------------------------------------- */

      console.log(
        "❌ OpenAI response contained no image."
      );

      return res.status(500).json({

        ok: false,

        error:
          "Unexpected OpenAI image response."

      });

    } catch (error) {

      console.error("");
      console.error(
        "=========================================="
      );

      console.error(
        "❌ GENERATE PREVIEW FAILED"
      );

      console.error(
        "=========================================="
      );

      console.error(
        "Error name:",
        error.name
      );

      console.error(
        "Error message:",
        error.message
      );

      if (error.status) {

        console.error(
          "OpenAI status:",
          error.status
        );

      }

      if (error.code) {

        console.error(
          "OpenAI code:",
          error.code
        );

      }

      console.error(
        "Full error:",
        error
      );

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

  console.log(
    "❌ 404:",
    req.method,
    req.path
  );

  res.status(404).json({

    ok: false,

    error: "Route not found",

    path: req.path

  });

});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      "❌ GLOBAL SERVER ERROR"
    );

    console.error(error);

    res.status(500).json({

      ok: false,

      error:
        error.message ||
        "Server error"

    });

  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "=========================================="
    );

    console.log(
      "🚀 SticKing server started"
    );

    console.log(
      "🌐 Port:",
      PORT
    );

    console.log(
      "🔑 OpenAI configured:",
      openaiConfigured
    );

    console.log(
      "=========================================="
    );

  }
);
