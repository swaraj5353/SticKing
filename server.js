// server.js
// SticKing - AI Vehicle Tattoo / Decal Customizer
//
// Existing endpoints preserved:
// POST /generate-preview
// POST /refine-preview
// POST /generate-decal
//
// IMPORTANT:
// This backend is designed to work with the existing frontend.
// Do not change the endpoint names or response structure.

const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const path = require("path");

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const MAX_IMAGE_SIZE = 12 * 1024 * 1024; // 12 MB

/* =========================================================
   OPENAI
========================================================= */

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "WARNING: OPENAI_API_KEY is not configured."
  );
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================================
   CORS
   Allows the existing Odoo website to call this backend.
========================================================= */

app.use((req, res, next) => {
  const allowedOrigins = [
    "https://sticking.odoo.com",
    "https://www.sticking.odoo.com",
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
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
    return res.sendStatus(204);
  }

  next();
});

/* =========================================================
   BODY PARSING
========================================================= */

app.use(
  express.json({
    limit: "30mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb",
  })
);

/* =========================================================
   STATIC WEBSITE FILES
   KEEP YOUR EXISTING PUBLIC FOLDER UNCHANGED.
========================================================= */

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/* =========================================================
   IMAGE UPLOAD
========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          "Only JPG, PNG and WEBP images are supported."
        )
      );
    }

    callback(null, true);
  },
});

/* =========================================================
   HELPER: CLEAN USER TEXT
========================================================= */

function cleanText(value, maxLength) {
  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

/* =========================================================
   AI PROMPT BUILDER
========================================================= */

function buildPrompt({
  part,
  widthCm,
  heightCm,
  description,
  extra,
}) {
  const safePart =
    cleanText(part, 100);

  const safeDescription =
    cleanText(description, 2000);

  const safeExtra =
    cleanText(extra, 1500);

  const partText = safePart
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
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "SticKing AI Vehicle Customizer",
    status: "running",
  });
});

/* =========================================================
   GENERATE VEHICLE PREVIEW
========================================================= */

app.post(
  "/generate-preview",
  upload.single("vehiclePhoto"),
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          success: false,
          error:
            "OpenAI API key is not configured on the server.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error:
            "Please upload a vehicle photo.",
        });
      }

      const {
        part,
        widthCm,
        heightCm,
        description,
      } = req.body;

      if (!description) {
        return res.status(400).json({
          success: false,
          error:
            "Please describe the decal design.",
        });
      }

      const image = await toFile(
        req.file.buffer,
        req.file.originalname || "vehicle.png",
        {
          type: req.file.mimetype,
        }
      );

      const prompt = buildPrompt({
        part,
        widthCm,
        heightCm,
        description,
      });

      console.log(
        "Generating vehicle preview..."
      );

      const result =
        await openai.images.edit({
          model: "gpt-image-1",
          image,
          prompt,
        });

      const imageBase64 =
        result?.data?.[0]?.b64_json;

      if (!imageBase64) {
        throw new Error(
          "OpenAI returned no image data."
        );
      }

      return res.json({
        success: true,
        image:
          `data:image/png;base64,${imageBase64}`,
        promptUsed: prompt,
      });

    } catch (err) {
      console.error(
        "GENERATE PREVIEW ERROR:",
        err
      );

      if (
        err?.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res.status(413).json({
          success: false,
          error:
            "Vehicle image is too large. Maximum size is 12 MB.",
        });
      }

      return res.status(500).json({
        success: false,
        error:
          err?.message ||
          "Something went wrong generating the preview.",
      });
    }
  }
);

/* =========================================================
   REFINE EXISTING PREVIEW
========================================================= */

app.post(
  "/refine-preview",
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          success: false,
          error:
            "OpenAI API key is not configured on the server.",
        });
      }

      const {
        previousImageBase64,
        part,
        widthCm,
        heightCm,
        description,
        refinement,
      } = req.body;

      if (!previousImageBase64) {
        return res.status(400).json({
          success: false,
          error:
            "No previous image supplied to refine.",
        });
      }

      if (!refinement) {
        return res.status(400).json({
          success: false,
          error:
            "Please describe what you want changed.",
        });
      }

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
            "The previous image could not be read.",
        });
      }

      if (
        buffer.length >
        MAX_IMAGE_SIZE
      ) {
        return res.status(413).json({
          success: false,
          error:
            "The previous preview is too large to refine.",
        });
      }

      const image =
        await toFile(
          buffer,
          "previous-preview.png",
          {
            type: "image/png",
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
          extra: refinement,
        });

      console.log(
        "Refining vehicle preview..."
      );

      const result =
        await openai.images.edit({
          model: "gpt-image-1",
          image,
          prompt,
        });

      const imageBase64 =
        result?.data?.[0]?.b64_json;

      if (!imageBase64) {
        throw new Error(
          "OpenAI returned no refined image."
        );
      }

      return res.json({
        success: true,
        image:
          `data:image/png;base64,${imageBase64}`,
        promptUsed: prompt,
      });

    } catch (err) {
      console.error(
        "REFINE PREVIEW ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        error:
          err?.message ||
          "Something went wrong refining the preview.",
      });
    }
  }
);

/* =========================================================
   GENERATE STANDALONE DECAL
========================================================= */

app.post(
  "/generate-decal",
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          success: false,
          error:
            "OpenAI API key is not configured on the server.",
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
            "No design description supplied.",
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

        "Suitable for PNG vinyl decal production.",
      ].join(" ");

      console.log(
        "Generating standalone decal..."
      );

      const result =
        await openai.images.generate({
          model: "gpt-image-1",
          prompt,
          background: "transparent",
        });

      const imageBase64 =
        result?.data?.[0]?.b64_json;

      if (!imageBase64) {
        throw new Error(
          "OpenAI returned no decal image."
        );
      }

      return res.json({
        success: true,
        image:
          `data:image/png;base64,${imageBase64}`,
      });

    } catch (err) {
      console.error(
        "GENERATE DECAL ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        error:
          err?.message ||
          "Something went wrong generating the decal.",
      });
    }
  }
);

/* =========================================================
   MULTER / UPLOAD ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {
    if (
      err?.code ===
      "LIMIT_FILE_SIZE"
    ) {
      return res.status(413).json({
        success: false,
        error:
          "Image is too large. Maximum allowed size is 12 MB.",
      });
    }

    if (
      err?.message?.includes(
        "Only JPG"
      )
    ) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }

    next(err);
  }
);

/* =========================================================
   ROOT ROUTE
   Keeps your existing Render/public website working.
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

/* =========================================================
   GENERAL ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {
    console.error(
      "SERVER ERROR:",
      err
    );

    res.status(500).json({
      success: false,
      error:
        "Internal server error.",
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

// IMPORTANT FOR RENDER:
// Bind to 0.0.0.0 and use Render's PORT variable.

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `SticKing server running on ${HOST}:${PORT}`
    );
  }
);
