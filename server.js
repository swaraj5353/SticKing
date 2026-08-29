// server.js
// SticKing - AI Vehicle Tattoo / Decal Customizer
// Includes Supabase order management

const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const { createClient } = require("@supabase/supabase-js");
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
   SUPABASE
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

let supabase = null;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.warn(
    "WARNING: SUPABASE_URL or SUPABASE_SECRET_KEY is not configured."
  );
} else {
  supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  console.log("Supabase connection configured.");
}


/* =========================================================
   CORS
   Allows the existing Odoo website to call this backend.
========================================================= */

app.use((req, res, next) => {
  const allowedOrigins = [
    "https://sticking.odoo.com",
    "https://www.sticking.odoo.com"
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
    limit: "30mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb"
  })
);


/* =========================================================
   STATIC WEBSITE FILES
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
   HELPER: NUMBER
========================================================= */

function cleanNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}


/* =========================================================
   HELPER: ORDER NUMBER
========================================================= */

function generateOrderNumber() {
  const now = new Date();

  const date =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  const random =
    Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

  return `STK-${date}-${random}`;
}


/* =========================================================
   AI PROMPT BUILDER
========================================================= */

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
      : ""
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
    databaseConfigured: !!supabase
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
            "OpenAI API key is not configured on the server."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error:
            "Please upload a vehicle photo."
        });
      }

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

      const image = await toFile(
        req.file.buffer,
        req.file.originalname || "vehicle.png",
        {
          type: req.file.mimetype
        }
      );

      const prompt = buildPrompt({
        part,
        widthCm,
        heightCm,
        description
      });

      console.log(
        "Generating vehicle preview..."
      );

      const result =
        await openai.images.edit({
          model: "gpt-image-1",
          image,
          prompt
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
        promptUsed: prompt
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
            "Vehicle image is too large. Maximum size is 12 MB."
        });
      }

      return res.status(500).json({
        success: false,
        error:
          err?.message ||
          "Something went wrong generating the preview."
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
            "OpenAI API key is not configured on the server."
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
            type: "image/png"
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
          extra: refinement
        });

      console.log(
        "Refining vehicle preview..."
      );

      const result =
        await openai.images.edit({
          model: "gpt-image-1",
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

      return res.json({
        success: true,
        image:
          `data:image/png;base64,${imageBase64}`,
        promptUsed: prompt
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
          "Something went wrong refining the preview."
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
            "OpenAI API key is not configured on the server."
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
        "Generating standalone decal..."
      );

      const result =
        await openai.images.generate({
          model: "gpt-image-1",
          prompt,
          background: "transparent"
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
          `data:image/png;base64,${imageBase64}`
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
          "Something went wrong generating the decal."
      });
    }
  }
);


/* =========================================================
   CREATE CUSTOMER ORDER
========================================================= */

app.post(
  "/api/orders",
  async (req, res) => {
    try {

      if (!supabase) {
        return res.status(500).json({
          success: false,
          error:
            "Supabase is not configured on the server."
        });
      }

      const body = req.body || {};

      /* -----------------------------------------------------
         CUSTOMER
      ----------------------------------------------------- */

      const customerName =
        cleanText(
          body.customer_name ||
          body.customerName,
          150
        );

      const customerEmail =
        cleanText(
          body.customer_email ||
          body.customerEmail,
          200
        );

      const customerPhone =
        cleanText(
          body.customer_phone ||
          body.customerPhone,
          50
        );

      if (!customerName) {
        return res.status(400).json({
          success: false,
          error:
            "Customer name is required."
        });
      }

      if (
        !customerEmail &&
        !customerPhone
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Customer email or phone number is required."
        });
      }


      /* -----------------------------------------------------
         VEHICLE
      ----------------------------------------------------- */

      const vehicleMake =
        cleanText(
          body.vehicle_make ||
          body.vehicleMake,
          100
        );

      const vehicleModel =
        cleanText(
          body.vehicle_model ||
          body.vehicleModel,
          100
        );

      const vehicleYear =
        cleanText(
          body.vehicle_year ||
          body.vehicleYear,
          30
        );

      const vehicleColor =
        cleanText(
          body.vehicle_color ||
          body.vehicleColor,
          50
        );


      /* -----------------------------------------------------
         DESIGN
      ----------------------------------------------------- */

      const designId =
        cleanText(
          body.design_id ||
          body.designId,
          150
        );

      const designName =
        cleanText(
          body.design_name ||
          body.designName ||
          body.description,
          200
        );

      if (!designName) {
        return res.status(400).json({
          success: false,
          error:
            "Design name is required."
        });
      }


      /* -----------------------------------------------------
         SIZE / PRODUCTION
      ----------------------------------------------------- */

      const placement =
        cleanText(
          body.placement ||
          body.part,
          100
        );

      const widthCm =
        cleanNumber(
          body.width_cm ||
          body.widthCm
        );

      const heightCm =
        cleanNumber(
          body.height_cm ||
          body.heightCm
        );

      const quantity =
        Math.max(
          1,
          Math.floor(
            cleanNumber(body.quantity) || 1
          )
        );

      const unitPrice =
        cleanNumber(
          body.unit_price ||
          body.unitPrice
        );

      const totalPrice =
        cleanNumber(
          body.total_price ||
          body.totalPrice
        );


      /* -----------------------------------------------------
         PREVIEW / NOTES
      ----------------------------------------------------- */

      const previewImageUrl =
        cleanText(
          body.preview_image_url ||
          body.previewImageUrl,
          2000
        );

      const customerNotes =
        cleanText(
          body.customer_notes ||
          body.customerNotes,
          3000
        );


      /* -----------------------------------------------------
         ADDRESS
      ----------------------------------------------------- */

      const addressLine1 =
        cleanText(
          body.address_line1 ||
          body.addressLine1,
          250
        );

      const addressLine2 =
        cleanText(
          body.address_line2 ||
          body.addressLine2,
          250
        );

      const city =
        cleanText(
          body.city,
          100
        );

      const state =
        cleanText(
          body.state,
          100
        );

      const pincode =
        cleanText(
          body.pincode ||
          body.pinCode,
          20
        );

      const country =
        cleanText(
          body.country || "India",
          100
        );


      /* -----------------------------------------------------
         ORDER NUMBER
      ----------------------------------------------------- */

      const orderNumber =
        generateOrderNumber();


      /* -----------------------------------------------------
         INSERT INTO SUPABASE
      ----------------------------------------------------- */

      const orderData = {

        order_number: orderNumber,

        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,

        vehicle_make: vehicleMake || null,
        vehicle_model: vehicleModel || null,
        vehicle_year: vehicleYear || null,
        vehicle_color: vehicleColor || null,

        design_id: designId || null,
        design_name: designName,
        design_image_url:
          cleanText(
            body.design_image_url ||
            body.designImageUrl,
            2000
          ) || null,

        placement: placement || null,

        width_cm: widthCm,
        height_cm: heightCm,

        quantity: quantity,

        unit_price: unitPrice,
        total_price: totalPrice,

        preview_image_url:
          previewImageUrl || null,

        customer_notes:
          customerNotes || null,

        address_line1:
          addressLine1 || null,

        address_line2:
          addressLine2 || null,

        city:
          city || null,

        state:
          state || null,

        pincode:
          pincode || null,

        country:
          country || "India",

        status: "NEW"
      };


      const {
        data,
        error
      } = await supabase
        .from("orders")
        .insert(orderData)
        .select()
        .single();


      if (error) {
        console.error(
          "SUPABASE ORDER ERROR:",
          error
        );

        return res.status(500).json({
          success: false,
          error:
            "Could not save the order.",
          details:
            error.message
        });
      }


      console.log(
        `New SticKing order created: ${orderNumber}`
      );


      return res.status(201).json({
        success: true,

        message:
          "Order received successfully.",

        orderNumber:
          data.order_number,

        orderId:
          data.id,

        status:
          data.status
      });

    } catch (err) {

      console.error(
        "CREATE ORDER ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        error:
          err?.message ||
          "Something went wrong creating the order."
      });
    }
  }
);


/* =========================================================
   GET ORDER BY ORDER NUMBER
   Useful for future customer order tracking.
========================================================= */

app.get(
  "/api/orders/:orderNumber",
  async (req, res) => {
    try {

      if (!supabase) {
        return res.status(500).json({
          success: false,
          error:
            "Supabase is not configured on the server."
        });
      }

      const orderNumber =
        cleanText(
          req.params.orderNumber,
          100
        );

      const {
        data,
        error
      } = await supabase
        .from("orders")
        .select(
          `
          id,
          order_number,
          design_name,
          vehicle_make,
          vehicle_model,
          quantity,
          total_price,
          status,
          created_at,
          updated_at
          `
        )
        .eq(
          "order_number",
          orderNumber
        )
        .maybeSingle();

      if (error) {
        console.error(
          "GET ORDER ERROR:",
          error
        );

        return res.status(500).json({
          success: false,
          error:
            "Could not retrieve order."
        });
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          error:
            "Order not found."
        });
      }

      return res.json({
        success: true,
        order: data
      });

    } catch (err) {

      console.error(
        "ORDER LOOKUP ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        error:
          "Could not retrieve order."
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
        error: err.message
      });
    }

    next(err);
  }
);


/* =========================================================
   ROOT ROUTE
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
        "Internal server error."
    });
  }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `SticKing server running on ${HOST}:${PORT}`
    );
  }
);
