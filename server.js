// ============================================================
// SticKing - AI Vehicle Tattoo / Decal Customizer
// COMPLETE SERVER.JS
// ============================================================

const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const path = require("path");

const app = express();

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const MAX_IMAGE_SIZE = 12 * 1024 * 1024; // 12 MB

// ============================================================
// OPENAI
// ============================================================

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is NOT configured.");
} else {
  console.log("✅ OPENAI_API_KEY is configured.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================
// CORS
// ============================================================

const allowedOrigins = [
  "https://sticking.odoo.com",
  "https://www.sticking.odoo.com",
  "https://sticking.onrender.com"
];

app.use((req, res, next) => {

  const origin = req.headers.origin;

  console.log(
    `➡️ ${req.method} ${req.path}` +
    (origin ? ` | Origin: ${origin}` : "")
  );

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin
    );
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
    console.log("✅ CORS preflight accepted");
    return res.sendStatus(204);
  }

  next();
});

// ============================================================
// BODY PARSING
// ============================================================

app.use(
  express.json({
    limit: "30mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "30mb"
  })
);

// ============================================================
// STATIC WEBSITE
// ============================================================

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// ============================================================
// IMAGE UPLOAD
// ============================================================

const upload = multer({

  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1
  },

  fileFilter: (req, file, callback) => {

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {

      return callback(
        new Error(
          "Only JPG, PNG and WEBP images are supported."
        )
      );

    }

    callback(null, true);
  }

});

// ============================================================
// HELPER
// ============================================================

function cleanText(value, maxLength) {

  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

// ============================================================
// OPENAI ERROR HELPER
// ============================================================

function getOpenAIError(err) {

  console.error("========== OPENAI ERROR ==========");
  console.error(err);
  console.error("==================================");

  if (!err) {
    return "Unknown OpenAI error.";
  }

  if (err.status === 401) {
    return "OpenAI API key is invalid or unauthorized.";
  }

  if (err.status === 403) {
    return "OpenAI API access was denied.";
  }

  if (err.status === 429) {
    return (
      "OpenAI request was rejected. " +
      "This may be due to quota, billing, rate limits, " +
      "or insufficient API credits."
    );
  }

  if (err.status >= 500) {
    return "OpenAI is currently experiencing a server error.";
  }

  return (
    err.message ||
    err.error?.message ||
    "OpenAI request failed."
  );
}

// ============================================================
// AI PROMPT BUILDER
// ============================================================

function buildPrompt({
  part,
  widthCm,
  heightCm,
  description,
  extra
}) {

  const safePart =
    cleanText(part, 100);

  const safeDescription =
    cleanText(description, 2000);

  const safeExtra =
    cleanText(extra, 1500);

  const partText =
    safePart
      ? `on the vehicle's ${safePart}`
      : "on the vehicle";

  let sizeText = "";

  if (widthCm && heightCm) {

    sizeText =
      `The decal should fit naturally within approximately ` +
      `${cleanText(widthCm, 30)} cm wide by ` +
      `${cleanText(heightCm, 30)} cm tall.`;

  }

  return [

    `Apply a custom vehicle tattoo/decal ${partText}.`,

    `Design requested: ${safeDescription}.`,

    sizeText,

    "Make the design look like a real professionally applied vinyl decal.",

    "Follow the exact perspective, curves, edges, panel lines and contours of the vehicle.",

    "Do not change the vehicle model, body shape, wheels, lights, mirrors, windows, grille or surroundings.",

    "Keep the original vehicle photo realistic.",

    "Do not create a floating sticker or pasted rectangular image.",

    "Make the decal clean, tasteful and visually balanced.",

    "The design should be practical for DIY vinyl sticker production.",

    "Avoid unnecessarily tiny details that would be difficult to cut or apply.",

    "For glass or windshield designs, keep the design translucent and avoid blocking the driver's primary field of view.",

    "Keep the decal within the requested vehicle panel and do not spill onto other panels.",

    safeExtra
      ? `Additional instruction: ${safeExtra}.`
      : ""

  ]
    .filter(Boolean)
    .join(" ");
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {

  res.status(200).json({

    ok: true,

    service:
      "SticKing AI Vehicle Customizer",

    status:
      "running",

    openaiConfigured:
      Boolean(process.env.OPENAI_API_KEY),

    timestamp:
      new Date().toISOString()

  });

});

// ============================================================
// GENERATE VEHICLE PREVIEW
// ============================================================

app.post(
  "/generate-preview",
  upload.single("vehiclePhoto"),

  async (req, res) => {

    console.log(
      "=========================================="
    );

    console.log(
      "🚗 GENERATE PREVIEW REQUEST"
    );

    try {

      // ------------------------------------------------------
      // API KEY CHECK
      // ------------------------------------------------------

      if (!process.env.OPENAI_API_KEY) {

        console.error(
          "❌ OPENAI_API_KEY missing."
        );

        return res.status(500).json({

          success: false,

          error:
            "OpenAI API key is not configured on the Render server."

        });

      }

      // ------------------------------------------------------
      // IMAGE CHECK
      // ------------------------------------------------------

      if (!req.file) {

        console.error(
          "❌ No vehicle image received."
        );

        return res.status(400).json({

          success: false,

          error:
            "Please upload a vehicle photo."

        });

      }

      console.log(
        "📷 Image:",
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

      // ------------------------------------------------------
      // FORM DATA
      // ------------------------------------------------------

      const {
        part,
        widthCm,
        heightCm,
        description
      } = req.body;

      if (!description) {

        return res.status(400).json({

          success: false,

          error:
            "Please describe the decal design."

        });

      }

      // ------------------------------------------------------
      // CONVERT IMAGE
      // ------------------------------------------------------

      const image = await toFile(

        req.file.buffer,

        req.file.originalname ||
          "vehicle.png",

        {
          type: req.file.mimetype
        }

      );

      // ------------------------------------------------------
      // PROMPT
      // ------------------------------------------------------

      const prompt =
        buildPrompt({

          part,
          widthCm,
          heightCm,
          description

        });

      console.log(
        "🧠 Prompt created."
      );

      console.log(
        "🤖 Sending request to OpenAI..."
      );

      // ------------------------------------------------------
      // OPENAI
      // ------------------------------------------------------

      const result =
        await openai.images.edit({

          model:
            "gpt-image-1",

          image,

          prompt

        });

      console.log(
        "✅ OpenAI response received."
      );

      // ------------------------------------------------------
      // IMAGE RESULT
      // ------------------------------------------------------

      const imageBase64 =
        result?.data?.[0]?.b64_json;

      if (!imageBase64) {

        throw new Error(
          "OpenAI returned no image data."
        );

      }

      console.log(
        "🖼️ Preview image generated successfully."
      );

      // ------------------------------------------------------
      // RESPONSE
      // ------------------------------------------------------

      return res.json({

        success: true,

        image:
          `data:image/png;base64,${imageBase64}`,

        promptUsed:
          prompt

      });

    } catch (err) {

      console.error(
        "❌ GENERATE PREVIEW FAILED"
      );

      const errorMessage =
        getOpenAIError(err);

      return res.status(
        err?.status || 500
      ).json({

        success: false,

        error:
          errorMessage

      });

    }

  }
);

// ============================================================
// REFINE EXISTING PREVIEW
// ============================================================

app.post(
  "/refine-preview",

  async (req, res) => {

    console.log(
      "=========================================="
    );

    console.log(
      "🎨 REFINE PREVIEW REQUEST"
    );

    try {

      if (!process.env.OPENAI_API_KEY) {

        return res.status(500).json({

          success: false,

          error:
            "OpenAI API key is not configured on the Render server."

        });

      }

      const {

        previousImageBase64,

        part,

        widthCm,

        heightCm,

        description,

        refinement

      } = req.body;

      if (!previousImageBase64) {

        return res.status(400).json({

          success: false,

          error:
            "No previous image supplied to refine."

        });

      }

      if (!refinement) {

        return res.status(400).json({

          success: false,

          error:
            "Please describe what you want changed."

        });

      }

      // ------------------------------------------------------
      // REMOVE DATA URL PREFIX
      // ------------------------------------------------------

      const base64Data =
        String(previousImageBase64)
          .replace(
            /^data:image\/\w+;base64,/,
            ""
          );

      const buffer =
        Buffer.from(
          base64Data,
          "base64"
        );

      if (!buffer.length) {

        return res.status(400).json({

          success: false,

          error:
            "The previous image could not be read."

        });

      }

      if (
        buffer.length >
        MAX_IMAGE_SIZE
      ) {

        return res.status(413).json({

          success: false,

          error:
            "The previous preview is too large to refine."

        });

      }

      const image =
        await toFile(

          buffer,

          "previous-preview.png",

          {
            type:
              "image/png"
          }

        );

      const prompt =
        buildPrompt({

          part,

          widthCm,

          heightCm,

          description:
            description ||
            "the existing vehicle decal",

          extra:
            refinement

        });

      console.log(
        "🤖 Sending refinement to OpenAI..."
      );

      const result =
        await openai.images.edit({

          model:
            "gpt-image-1",

          image,

          prompt

        });

      const imageBase64 =
        result?.data?.[0]?.b64_json;

      if (!imageBase64) {

        throw new Error(
          "OpenAI returned no refined image."
        );

      }

      console.log(
        "✅ Refined image generated."
      );

      return res.json({

        success: true,

        image:
          `data:image/png;base64,${imageBase64}`,

        promptUsed:
          prompt

      });

    } catch (err) {

      console.error(
        "❌ REFINE PREVIEW FAILED"
      );

      const errorMessage =
        getOpenAIError(err);

      return res.status(
        err?.status || 500
      ).json({

        success: false,

        error:
          errorMessage

      });

    }

  }
);

// ============================================================
// GENERATE STANDALONE DECAL
// ============================================================

app.post(
  "/generate-decal",

  async (req, res) => {

    console.log(
      "=========================================="
    );

    console.log(
      "✂️ GENERATE DECAL REQUEST"
    );

    try {

      if (!process.env.OPENAI_API_KEY) {

        return res.status(500).json({

          success: false,

          error:
            "OpenAI API key is not configured on the Render server."

        });

      }

      const description =
        cleanText(
          req.body.description,
          2000
        );

      if (!description) {

        return res.status(400).json({

          success: false,

          error:
            "No design description supplied."

        });

      }

      const prompt = [

        "Create a standalone vehicle decal/tattoo graphic.",

        `Design: ${description}.`,

        "Create clean, simplified vinyl decal artwork.",

        "Use bold shapes and clear outlines.",

        "Make the design practical for DIY cutting and application.",

        "Avoid extremely thin lines and unnecessarily tiny details.",

        "No vehicle.",

        "No mockup.",

        "No background scene.",

        "No floor.",

        "No shadows outside the artwork.",

        "No rectangular background.",

        "Isolated artwork only.",

        "Transparent background.",

        "Suitable for PNG vinyl decal production."

      ].join(" ");

      console.log(
        "🤖 Sending decal request to OpenAI..."
      );

      const result =
        await openai.images.generate({

          model:
            "gpt-image-1",

          prompt,

          background:
            "transparent"

        });

      const imageBase64 =
        result?.data?.[0]?.b64_json;

      if (!imageBase64) {

        throw new Error(
          "OpenAI returned no decal image."
        );

      }

      console.log(
        "✅ Standalone decal generated."
      );

      return res.json({

        success: true,

        image:
          `data:image/png;base64,${imageBase64}`

      });

    } catch (err) {

      console.error(
        "❌ GENERATE DECAL FAILED"
      );

      const errorMessage =
        getOpenAIError(err);

      return res.status(
        err?.status || 500
      ).json({

        success: false,

        error:
          errorMessage

      });

    }

  }
);

// ============================================================
// MULTER / UPLOAD ERROR HANDLER
// ============================================================

app.use(
  (err, req, res, next) => {

    console.error(
      "❌ UPLOAD/SERVER ERROR:",
      err
    );

    if (
      err?.code ===
      "LIMIT_FILE_SIZE"
    ) {

      return res.status(413).json({

        success: false,

        error:
          "Image is too large. Maximum allowed size is 12 MB."

      });

    }

    if (
      err?.message?.includes(
        "Only JPG"
      )
    ) {

      return res.status(400).json({

        success: false,

        error:
          err.message

      });

    }

    next(err);

  }
);

// ============================================================
// ROOT ROUTE
// ============================================================

app.get("/", (req, res) => {

  res.sendFile(

    path.join(
      __dirname,
      "public",
      "index.html"
    )

  );

});

// ============================================================
// GENERAL ERROR HANDLER
// ============================================================

app.use(
  (err, req, res, next) => {

    console.error(
      "❌ GENERAL SERVER ERROR:",
      err
    );

    res.status(500).json({

      success: false,

      error:
        err?.message ||
        "Internal server error."

    });

  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  HOST,
  () => {

    console.log(
      "=========================================="
    );

    console.log(
      "🚀 SticKing server started"
    );

    console.log(
      `🌐 http://${HOST}:${PORT}`
    );

    console.log(
      `🔑 OpenAI configured: ${Boolean(
        process.env.OPENAI_API_KEY
      )}`
    );

    console.log(
      "=========================================="
    );

  }
);
