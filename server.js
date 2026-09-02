const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const crypto = require("crypto");
const path = require("path");

const app = express();

/* =========================================================
   SERVER CONFIGURATION
   ========================================================= */

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const openaiConfigured = !!OPENAI_API_KEY;

const supabaseConfigured =
  !!SUPABASE_URL && !!SUPABASE_SECRET_KEY;

const adminConfigured = !!ADMIN_PASSWORD;


/* =========================================================
   OPENAI
   ========================================================= */

const openai = openaiConfigured
  ? new OpenAI({
      apiKey: OPENAI_API_KEY
    })
  : null;


/* =========================================================
   PUBLIC WEBSITE DIRECTORY
   ========================================================= */

const PUBLIC_DIR = path.join(
  __dirname,
  "public"
);


/* =========================================================
   STATIC WEBSITE FILES
   ========================================================= */

app.use(
  express.static(
    PUBLIC_DIR,
    {
      extensions: ["html"],
      index: "index.html"
    }
  )
);


/* =========================================================
   SUPABASE BASE URL
   ========================================================= */

const supabaseBaseUrl = SUPABASE_URL
  ? SUPABASE_URL
      .replace(/\/rest\/v1\/?$/, "")
      .replace(/\/$/, "")
  : "";


/* =========================================================
   CONFIGURATION LOGS
   ========================================================= */

console.log(
  openaiConfigured
    ? "✅ OPENAI_API_KEY is configured."
    : "❌ OPENAI_API_KEY is NOT configured."
);

console.log(
  supabaseConfigured
    ? "✅ SUPABASE_URL and SUPABASE_SECRET_KEY are configured."
    : "❌ Supabase is NOT configured."
);

console.log(
  adminConfigured
    ? "✅ ADMIN_PASSWORD is configured."
    : "❌ ADMIN_PASSWORD is NOT configured."
);

console.log(
  `📁 Public directory: ${PUBLIC_DIR}`
);


/* =========================================================
   CORS
   ========================================================= */

app.use(
  (req, res, next) => {

    const origin =
      req.headers.origin;

    const allowedOrigins = [
      "https://sticking.odoo.com",
      "https://www.sticking.odoo.com",
      "https://sticking.onrender.com"
    ];

    if (
      origin &&
      allowedOrigins.includes(origin)
    ) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        origin
      );
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, x-admin-password"
    );

    res.setHeader(
      "Access-Control-Allow-Credentials",
      "true"
    );

    if (
      req.method === "OPTIONS"
    ) {
      return res
        .status(204)
        .end();
    }

    next();
  }
);


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
    limit: "20mb"
  })
);


/* =========================================================
   REQUEST LOGGER
   ========================================================= */

app.use(
  (req, res, next) => {

    console.log(
      `➡️ ${req.method} ${req.path}`
    );

    next();
  }
);


/* =========================================================
   FILE UPLOAD
   ========================================================= */

const upload = multer({
  storage:
    multer.memoryStorage(),

  limits: {
    fileSize:
      MAX_IMAGE_SIZE,
    files: 1
  },

  fileFilter:
    (req, file, callback) => {

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
      ];

      if (
        !allowedTypes.includes(
          file.mimetype
        )
      ) {
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
   TEXT CLEANING
   ========================================================= */

function cleanText(
  value,
  maxLength
) {

  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .slice(
      0,
      maxLength
    );
}


/* =========================================================
   SUPABASE HEADERS
   ========================================================= */

function supabaseHeaders() {

  return {

    apikey:
      SUPABASE_SECRET_KEY,

    Authorization:
      `Bearer ${SUPABASE_SECRET_KEY}`,

    "Content-Type":
      "application/json"
  };
}


/* =========================================================
   SUPABASE REQUEST
   ========================================================= */

async function supabaseRequest(
  requestPath,
  options = {}
) {

  if (
    !supabaseConfigured
  ) {
    throw new Error(
      "Supabase is not configured."
    );
  }

  const response =
    await fetch(
      `${supabaseBaseUrl}${requestPath}`,
      {
        ...options,

        headers: {
          ...supabaseHeaders(),
          ...(options.headers || {})
        }
      }
    );

  const text =
    await response.text();

  let data = null;

  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    data = text;
  }

  if (
    !response.ok
  ) {

    throw new Error(
      data?.message ||
      data?.error ||
      data?.msg ||
      text ||
      `Supabase error ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   STORAGE
   ========================================================= */

const STORAGE_BUCKET =
  "vehicle-orders";


/* =========================================================
   ENSURE STORAGE BUCKET
   ========================================================= */

async function ensureStorageBucket() {

  if (
    !supabaseConfigured
  ) {
    return;
  }

  try {

    const response =
      await fetch(
        `${supabaseBaseUrl}/storage/v1/bucket`,
        {
          method:
            "POST",

          headers:
            supabaseHeaders(),

          body:
            JSON.stringify({
              id:
                STORAGE_BUCKET,

              name:
                STORAGE_BUCKET,

              public:
                false
            })
        }
      );

    if (
      response.ok ||
      response.status === 409
    ) {

      console.log(
        `🗄️ Storage bucket ready: ${STORAGE_BUCKET}`
      );

      return;
    }

    const text =
      await response.text();

    console.warn(
      "⚠️ Could not create storage bucket:",
      text
    );

  } catch (error) {

    console.warn(
      "⚠️ Storage bucket check failed:",
      error.message
    );
  }
}


/* =========================================================
   UPLOAD TO STORAGE
   ========================================================= */

async function uploadToStorage(
  buffer,
  fileName,
  contentType
) {

  if (
    !supabaseConfigured
  ) {
    return null;
  }

  const safeFileName =
    String(
      fileName ||
      "upload"
    )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

  const storagePath =
    `${new Date().getFullYear()}/` +
    `${Date.now()}-` +
    `${crypto.randomUUID()}-` +
    `${safeFileName}`;

  const response =
    await fetch(
      `${supabaseBaseUrl}/storage/v1/object/` +
      `${STORAGE_BUCKET}/` +
      `${encodeURIComponent(storagePath)}`,
      {
        method:
          "POST",

        headers: {
          apikey:
            SUPABASE_SECRET_KEY,

          Authorization:
            `Bearer ${SUPABASE_SECRET_KEY}`,

          "Content-Type":
            contentType ||
            "application/octet-stream",

          "x-upsert":
            "false"
        },

        body:
          buffer
      }
    );

  const text =
    await response.text();

  if (
    !response.ok
  ) {

    throw new Error(
      `Storage upload failed: ${text}`
    );
  }

  return storagePath;
}


/* =========================================================
   CREATE SIGNED STORAGE URL
   ========================================================= */

async function createSignedUrl(
  storagePath
) {

  if (
    !storagePath ||
    !supabaseConfigured
  ) {
    return null;
  }

  try {

    const response =
      await fetch(
        `${supabaseBaseUrl}` +
        `/storage/v1/object/sign/` +
        `${STORAGE_BUCKET}/` +
        `${encodeURIComponent(storagePath)}`,
        {
          method:
            "POST",

          headers:
            supabaseHeaders(),

          body:
            JSON.stringify({
              expiresIn:
                60 * 60 * 24
            })
        }
      );

    const text =
      await response.text();

    if (
      !response.ok
    ) {

      console.error(
        "❌ Signed URL error:",
        text
      );

      return null;
    }

    const data =
      JSON.parse(text);

    if (
      !data.signedURL
    ) {
      return null;
    }

    return (
      `${supabaseBaseUrl}` +
      `/storage/v1` +
      data.signedURL
    );

  } catch (error) {

    console.error(
      "❌ Signed URL creation failed:",
      error.message
    );

    return null;
  }
}


/* =========================================================
   ORDERS
   ========================================================= */

async function createOrder(
  order
) {

  const result =
    await supabaseRequest(
      "/rest/v1/orders",
      {
        method:
          "POST",

        headers: {
          Prefer:
            "return=representation"
        },

        body:
          JSON.stringify(order)
      }
    );

  return Array.isArray(result)
    ? result[0]
    : result;
}


async function updateOrder(
  id,
  updates
) {

  const result =
    await supabaseRequest(
      `/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,
      {
        method:
          "PATCH",

        headers: {
          Prefer:
            "return=representation"
        },

        body:
          JSON.stringify(updates)
      }
    );

  return Array.isArray(result)
    ? result[0]
    : result;
}


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({
      ok:
        true,

      service:
        "SticKing AI Vehicle Customizer",

      status:
        "running",

      openaiConfigured,

      supabaseConfigured,

      adminConfigured
    });
  }
);


/* =========================================================
   EXPLICIT WEBSITE ROUTES
   ========================================================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "index.html"
      )
    );
  }
);


app.get(
  "/gallery",
  (req, res) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "gallery.html"
      )
    );
  }
);


app.get(
  "/gallery.html",
  (req, res) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "gallery.html"
      )
    );
  }
);


app.get(
  "/admin",
  (req, res) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "admin.html"
      )
    );
  }
);


app.get(
  "/admin.html",
  (req, res) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "admin.html"
      )
    );
  }
);


/* =========================================================
   ADMIN LOGIN
   ========================================================= */

app.post(
  "/api/admin/login",
  (req, res) => {

    if (
      !adminConfigured
    ) {

      return res
        .status(500)
        .json({
          ok:
            false,

          error:
            "ADMIN_PASSWORD is not configured."
        });
    }

    const password =
      req.body?.password ||
      "";

    if (
      password !==
      ADMIN_PASSWORD
    ) {

      return res
        .status(401)
        .json({
          ok:
            false,

          error:
            "Incorrect admin password."
        });
    }

    console.log(
      "👑 Admin login successful."
    );

    res.json({
      ok:
        true,

      message:
        "Admin login successful."
    });
  }
);


/* =========================================================
   ADMIN AUTHENTICATION
   ========================================================= */

function requireAdmin(
  req,
  res,
  next
) {

  if (
    !adminConfigured
  ) {

    return res
      .status(500)
      .json({
        ok:
          false,

        error:
          "ADMIN_PASSWORD is not configured."
      });
  }

  const password =
    req.headers[
      "x-admin-password"
    ];

  if (
    !password ||
    password !==
    ADMIN_PASSWORD
  ) {

    return res
      .status(401)
      .json({
        ok:
          false,

        error:
          "Unauthorized."
      });
  }

  next();
}


/* =========================================================
   GET ADMIN ORDERS
   ========================================================= */

app.get(
  "/api/admin/orders",
  requireAdmin,
  async (req, res) => {

    try {

      const orders =
        await supabaseRequest(
          "/rest/v1/orders" +
          "?select=*" +
          "&order=created_at.desc"
        );

      const enriched =
        await Promise.all(
          (orders || [])
            .map(
              async (order) => {

                const originalUrl =
                  await createSignedUrl(
                    order.original_image_path
                  );

                const generatedUrl =
                  await createSignedUrl(
                    order.generated_image_path
                  );

                return {
                  ...order,

                  original_image_url:
                    originalUrl,

                  generated_image_url:
                    generatedUrl
                };
              }
            )
        );

      console.log(
        `📦 Admin orders loaded: ${enriched.length}`
      );

      res.json({
        ok:
          true,

        orders:
          enriched
      });

    } catch (error) {

      console.error(
        "❌ ADMIN ORDERS ERROR:",
        error
      );

      res
        .status(500)
        .json({
          ok:
            false,

          error:
            error.message ||
            "Could not load orders."
        });
    }
  }
);


/* =========================================================
   UPDATE ORDER STATUS
   ========================================================= */

app.patch(
  "/api/admin/orders/:id",
  requireAdmin,
  async (req, res) => {

    try {

      const allowedStatuses = [
        "new",
        "processing",
        "completed",
        "cancelled"
      ];

      const status =
        req.body?.status;

      if (
        !allowedStatuses
          .includes(status)
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            error:
              "Invalid order status."
          });
      }

      const updated =
        await updateOrder(
          req.params.id,
          {
            status
          }
        );

      console.log(
        `📌 Order ${req.params.id} status changed to ${status}`
      );

      res.json({
        ok:
          true,

        order:
          updated
      });

    } catch (error) {

      console.error(
        "❌ UPDATE ORDER ERROR:",
        error
      );

      res
        .status(500)
        .json({
          ok:
            false,

          error:
            error.message ||
            "Could not update order."
        });
    }
  }
);


/* =========================================================
   CREATE ORDER
   ========================================================= */

app.post(
  "/api/orders",
  async (req, res) => {

    try {

      const body =
        req.body || {};

      const order = {

        customer_name:
          body.customer_name ||
          body.customerName ||
          null,

        customer_email:
          body.customer_email ||
          body.customerEmail ||
          null,

        customer_phone:
          body.customer_phone ||
          body.customerPhone ||
          null,

        vehicle:
          body.vehicle ||
          body.vehicleModel ||
          null,

        design:
          body.design ||
          null,

        part:
          body.part ||
          null,

        width:
          body.width ||
          body.widthCm ||
          null,

        height:
          body.height ||
          body.heightCm ||
          null,

        description:
          body.description ||
          null,

        amount:
          body.amount ||
          0,

        status:
          "new"
      };

      const created =
        await createOrder(
          order
        );

      console.log(
        "🛒 Order created:",
        created?.id
      );

      res.json({
        ok:
          true,

        order:
          created
      });

    } catch (error) {

      console.error(
        "❌ CREATE ORDER ERROR:",
        error
      );

      res
        .status(500)
        .json({
          ok:
            false,

          error:
            error.message ||
            "Could not create order."
        });
    }
  }
);


/* =========================================================
   GENERATE VEHICLE PREVIEW
   ========================================================= */

app.post(
  "/generate-preview",
  upload.single("vehicleImage"),
  async (req, res) => {

    console.log(
      "=========================================="
    );

    console.log(
      "🚗 GENERATE PREVIEW REQUEST RECEIVED"
    );

    console.log(
      "=========================================="
    );

    let orderId =
      null;

    try {

      if (
        !openaiConfigured ||
        !openai
      ) {

        return res
          .status(500)
          .json({
            ok:
              false,

            error:
              "OpenAI API key is not configured."
          });
      }


      if (
        !req.file
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            error:
              "No vehicle image was uploaded."
          });
      }


      const design =
        cleanText(
          req.body.design,
          2000
        );

      const width =
        cleanText(
          req.body.width ||
          req.body.widthCm,
          30
        );

      const height =
        cleanText(
          req.body.height ||
          req.body.heightCm,
          30
        );

      const description =
        cleanText(
          req.body.description,
          2000
        );

      const extra =
        cleanText(
          req.body.extra,
          1500
        );

      const part =
        cleanText(
          req.body.part ||
          req.body.vehiclePart,
          100
        );

      const vehicleType =
        cleanText(
          req.body.vehicleType,
          50
        );

      const make =
        cleanText(
          req.body.make,
          80
        );

      const model =
        cleanText(
          req.body.model ||
          req.body.vehicleModel,
          100
        );

      const year =
        cleanText(
          req.body.year,
          10
        );

      const vehicle =
        [
          vehicleType,
          make,
          model,
          year
        ]
          .filter(Boolean)
          .join(" ");


      console.log(
        "📷 Image:",
        req.file.originalname
      );

      console.log(
        "📦 MIME type:",
        req.file.mimetype
      );

      console.log(
        "📏 File size:",
        req.file.size
      );

      console.log(
        "🎨 Design:",
        design
      );

      console.log(
        "🚗 Vehicle:",
        vehicle ||
        "not specified"
      );

      console.log(
        "🚪 Part:",
        part
      );

      console.log(
        "📐 Dimensions:",
        `${width} x ${height} cm`
      );


      /* -----------------------------------------------------
         SAVE ORIGINAL IMAGE
         ----------------------------------------------------- */

      let originalImagePath =
        null;

      if (
        supabaseConfigured
      ) {

        try {

          originalImagePath =
            await uploadToStorage(
              req.file.buffer,
              req.file.originalname,
              req.file.mimetype
            );

          console.log(
            "✅ Original image stored:",
            originalImagePath
          );

        } catch (error) {

          console.error(
            "⚠️ Original image storage failed:",
            error.message
          );
        }
      }


      /* -----------------------------------------------------
         CREATE ORDER BEFORE AI
         ----------------------------------------------------- */

      if (
        supabaseConfigured
      ) {

        try {

          const created =
            await createOrder({

              customer_name:
                req.body.customer_name ||
                req.body.customerName ||
                null,

              customer_email:
                req.body.customer_email ||
                req.body.customerEmail ||
                null,

              customer_phone:
                req.body.customer_phone ||
                req.body.customerPhone ||
                null,

              vehicle:
                vehicle ||
                null,

              design:
                design ||
                null,

              part:
                part ||
                null,

              width:
                width ||
                null,

              height:
                height ||
                null,

              description:
                description ||
                null,

              amount:
                req.body.amount ||
                0,

              status:
                "processing",

              original_image_path:
                originalImagePath,

              generated_image_path:
                null
            });

          orderId =
            created?.id ||
            null;

          console.log(
            "🛒 Order created:",
            orderId
          );

        } catch (error) {

          console.error(
            "⚠️ Could not create order:",
            error.message
          );
        }
      }


      /* -----------------------------------------------------
         AI PROMPT
         ----------------------------------------------------- */

      const prompt = [

        "You are a professional vehicle sticker and vinyl decal designer.",

        "Edit the uploaded vehicle photograph to create a realistic preview of the requested sticker or decal.",

        "Keep the original vehicle recognizable.",

        "Do not replace the vehicle with another vehicle.",

        "Keep the exact vehicle model whenever visible.",

        "Keep the original body shape and proportions.",

        "Keep the original camera perspective.",

        "Keep the original background whenever possible.",

        "Apply the artwork naturally to the requested panel.",

        "Follow the real curves, panel lines, contours and perspective of the vehicle.",

        "Respect doors, bonnet, fenders, fuel tanks, windows, glass, bumpers and other body panels.",

        "Preserve realistic lighting, reflections and shadows.",

        "Do not create a rectangular pasted image.",

        "Do not make the decal float beside the vehicle.",

        "Keep the decal within the requested area whenever possible.",

        "Do not add unrelated artwork.",

        "Make the final result look like a real photograph of a professionally installed decal.",

        `Vehicle type: ${vehicleType || "not specified"}.`,

        `Vehicle make: ${make || "not specified"}.`,

        `Vehicle model: ${model || "not specified"}.`,

        `Vehicle year: ${year || "not specified"}.`,

        `Vehicle description: ${vehicle || "not specified"}.`,

        `Requested panel: ${part || "not specified"}.`,

        `Requested sticker dimensions: ${width || "not specified"} cm wide x ${height || "not specified"} cm tall.`,

        `Design: ${design || description || "custom sticker design"}.`,

        `Customer instructions: ${description || "none"}.`,

        `Additional placement instructions: ${extra || "none"}.`

      ].join(" ");


      console.log(
        "🤖 Sending image to OpenAI..."
      );

      console.log(
        "🤖 Model: gpt-image-1"
      );


      /* -----------------------------------------------------
         CONVERT IMAGE
         ----------------------------------------------------- */

      const inputFile =
        await toFile(
          req.file.buffer,
          req.file.originalname ||
          "vehicle.png",
          {
            type:
              req.file.mimetype
          }
        );


      console.log(
        "✅ Image converted for OpenAI."
      );


      /* -----------------------------------------------------
         OPENAI IMAGE EDIT
         ----------------------------------------------------- */

      const imageResponse =
        await openai.images.edit({

          model:
            "gpt-image-1",

          image:
            inputFile,

          prompt,

          size:
            "1024x1024"
        });


      console.log(
        "✅ OpenAI response received."
      );


      /* -----------------------------------------------------
         CHECK RESULT
         ----------------------------------------------------- */

      if (
        !imageResponse ||
        !imageResponse.data ||
        !imageResponse.data[0] ||
        !imageResponse.data[0].b64_json
      ) {

        throw new Error(
          "OpenAI did not return an image."
        );
      }


      const base64Image =
        imageResponse
          .data[0]
          .b64_json;


      const generatedBuffer =
        Buffer.from(
          base64Image,
          "base64"
        );


      console.log(
        "✅ Generated image decoded."
      );


      /* -----------------------------------------------------
         SAVE GENERATED IMAGE
         ----------------------------------------------------- */

      let generatedImagePath =
        null;

      if (
        supabaseConfigured
      ) {

        try {

          generatedImagePath =
            await uploadToStorage(
              generatedBuffer,
              "ai-preview.png",
              "image/png"
            );

          console.log(
            "✅ AI preview stored:",
            generatedImagePath
          );


          if (
            orderId
          ) {

            await updateOrder(
              orderId,
              {
                generated_image_path:
                  generatedImagePath,

                status:
                  "new"
              }
            );

            console.log(
              "✅ Order updated with generated image."
            );
          }

        } catch (error) {

          console.error(
            "⚠️ Generated image storage failed:",
            error.message
          );
        }
      }


      console.log(
        "🎉 PREVIEW GENERATION COMPLETE"
      );

      console.log(
        "Order ID:",
        orderId
      );


      return res.json({

        ok:
          true,

        success:
          true,

        orderId,

        image:
          `data:image/png;base64,${base64Image}`
      });


    } catch (error) {

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
        error?.name
      );

      console.error(
        "Error message:",
        error?.message
      );

      console.error(
        "Error status:",
        error?.status
      );

      console.error(
        "Error code:",
        error?.code
      );

      console.error(
        "Full error:",
        error
      );


      if (
        orderId
      ) {

        try {

          await updateOrder(
            orderId,
            {
              status:
                "cancelled"
            }
          );

          console.log(
            "⚠️ Order marked as cancelled:",
            orderId
          );

        } catch (updateError) {

          console.error(
            "⚠️ Could not update cancelled order:",
            updateError.message
          );
        }
      }


      return res
        .status(500)
        .json({

          ok:
            false,

          success:
            false,

          error:
            error?.message ||
            "Image generation failed.",

          orderId
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

    console.log(
      "=========================================="
    );

    console.log(
      "🎨 REFINE PREVIEW REQUEST RECEIVED"
    );

    console.log(
      "=========================================="
    );

    try {

      if (
        !openaiConfigured ||
        !openai
      ) {

        return res
          .status(500)
          .json({
            ok:
              false,

            success:
              false,

            error:
              "OpenAI API key is not configured."
          });
      }


      const previousImageBase64 =
        req.body?.previousImageBase64;

      const refinement =
        cleanText(
          req.body?.refinement,
          1500
        );

      if (
        !previousImageBase64
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            success:
              false,

            error:
              "No previous preview supplied."
          });
      }


      if (
        !refinement
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            success:
              false,

            error:
              "Please describe the change you want."
          });
      }


      const base64 =
        String(
          previousImageBase64
        )
          .replace(
            /^data:image\/\w+;base64,/,
            ""
          );


      const buffer =
        Buffer.from(
          base64,
          "base64"
        );


      if (
        !buffer.length
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            success:
              false,

            error:
              "The previous preview could not be read."
          });
      }


      if (
        buffer.length >
        MAX_IMAGE_SIZE
      ) {

        return res
          .status(413)
          .json({
            ok:
              false,

            success:
              false,

            error:
              "The previous preview is too large."
          });
      }


      const inputFile =
        await toFile(
          buffer,
          "previous-preview.png",
          {
            type:
              "image/png"
          }
        );


      const prompt = [

        "Refine the existing vehicle decal preview.",

        "Do not replace the vehicle.",

        "Do not redesign unrelated parts of the image.",

        "Preserve the vehicle model, body shape, camera perspective, environment and realism.",

        "Keep the existing decal recognizable.",

        `Requested change: ${refinement}.`

      ].join(" ");


      console.log(
        "🤖 Refining with OpenAI..."
      );


      const imageResponse =
        await openai.images.edit({

          model:
            "gpt-image-1",

          image:
            inputFile,

          prompt,

          size:
            "1024x1024"
        });


      if (
        !imageResponse ||
        !imageResponse.data ||
        !imageResponse.data[0] ||
        !imageResponse.data[0].b64_json
      ) {

        throw new Error(
          "OpenAI did not return a refined image."
        );
      }


      const base64Image =
        imageResponse
          .data[0]
          .b64_json;


      console.log(
        "✅ Refined preview received."
      );


      res.json({

        ok:
          true,

        success:
          true,

        image:
          `data:image/png;base64,${base64Image}`
      });


    } catch (error) {

      console.error(
        "❌ REFINE PREVIEW ERROR:",
        error
      );

      res
        .status(500)
        .json({

          ok:
            false,

          success:
            false,

          error:
            error?.message ||
            "Could not refine the preview."
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

    console.log(
      "🖨️ GENERATE DECAL REQUEST"
    );

    try {

      if (
        !openaiConfigured ||
        !openai
      ) {

        return res
          .status(500)
          .json({
            ok:
              false,

            success:
              false,

            error:
              "OpenAI API key is not configured."
          });
      }


      const description =
        cleanText(
          req.body?.description,
          2000
        );


      if (
        !description
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            success:
              false,

            error:
              "No design description supplied."
          });
      }


      const prompt = [

        "Create a standalone vehicle decal graphic.",

        `Design: ${description}.`,

        "Clean professional vinyl decal artwork.",

        "Bold shapes and clear outlines.",

        "Practical for sticker cutting and application.",

        "No vehicle.",

        "No mockup.",

        "No road.",

        "No floor.",

        "No unrelated objects.",

        "No rectangular background.",

        "Isolated artwork.",

        "Transparent background.",

        "Suitable for PNG decal production."

      ].join(" ");


      const result =
        await openai.images.generate({

          model:
            "gpt-image-1",

          prompt,

          background:
            "transparent",

          size:
            "1024x1024"
        });


      if (
        !result ||
        !result.data ||
        !result.data[0] ||
        !result.data[0].b64_json
      ) {

        throw new Error(
          "OpenAI returned no decal image."
        );
      }


      const base64Image =
        result
          .data[0]
          .b64_json;


      const generatedBuffer =
        Buffer.from(
          base64Image,
          "base64"
        );


      let storedPath =
        null;


      if (
        supabaseConfigured
      ) {

        try {

          storedPath =
            await uploadToStorage(
              generatedBuffer,
              `decal-${Date.now()}.png`,
              "image/png"
            );

          console.log(
            "✅ Decal stored:",
            storedPath
          );

        } catch (error) {

          console.error(
            "⚠️ Decal storage failed:",
            error.message
          );
        }
      }


      res.json({

        ok:
          true,

        success:
          true,

        image:
          `data:image/png;base64,${base64Image}`,

        storedPath,

        fileName:
          `sticking-decal-${Date.now()}.png`
      });


    } catch (error) {

      console.error(
        "❌ GENERATE DECAL ERROR:",
        error
      );

      res
        .status(500)
        .json({

          ok:
            false,

          success:
            false,

          error:
            error?.message ||
            "Could not generate the decal."
        });
    }
  }
);


/* =========================================================
   PRIVATE ADMIN PRINT PREP AGENT
   ========================================================= */

app.post(
  "/api/admin/print-prep",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {

    console.log(
      "=========================================="
    );

    console.log(
      "🖨️ PRINT PREP REQUEST RECEIVED"
    );

    console.log(
      "=========================================="
    );

    try {

      if (
        !openaiConfigured ||
        !openai
      ) {

        return res
          .status(500)
          .json({
            ok:
              false,

            error:
              "OpenAI API key is not configured."
          });
      }


      if (
        !req.file
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            error:
              "Please upload an image."
          });
      }


      const quality =
        req.body?.quality ===
        "high"
          ? "high"
          : "medium";


      const removeBackground =
        String(
          req.body?.removeBackground ??
          "true"
        ) !== "false";


      console.log(
        "📷 File:",
        req.file.originalname
      );

      console.log(
        "📦 Type:",
        req.file.mimetype
      );

      console.log(
        "📏 Size:",
        req.file.size
      );

      console.log(
        "🎚️ Quality:",
        quality
      );

      console.log(
        "🪄 Remove background:",
        removeBackground
      );


      const inputFile =
        await toFile(
          req.file.buffer,
          req.file.originalname,
          {
            type:
              req.file.mimetype
          }
        );


      const prepPrompt = `

You are SticKing's private
professional sticker PRINT
PREPARATION agent.

Your job is NOT to redesign
the artwork.

Prepare the uploaded artwork
for physical sticker/vinyl
production while preserving
the original design as
faithfully as possible.

STRICT RULES:

- Preserve the original artwork.
- Preserve composition.
- Preserve proportions.
- Do not invent a new design.
- Do not add decorative elements.
- Do not change logos.
- Preserve readable text.
- Preserve colours as closely as possible.
- Remove unwanted background.
- Remove excess surrounding material.
- Remove obvious dust.
- Remove compression artifacts.
- Reduce noise.
- Clean rough edges.
- Clean jagged edges.
- Make the artwork crisp.
- Do not crop actual artwork.
- Do not distort artwork.
- Do not redesign the artwork.

${
  removeBackground
    ? "Make the background fully transparent and return a PNG with transparency."
    : "Keep the background only where it is genuinely part of the artwork."
}

The result should look
like clean professional
sticker-production artwork.

Do not turn it into
an unrelated AI-generated
design.

`;


      console.log(
        "🤖 Sending artwork to GPT-Image-2..."
      );


      const imageResponse =
        await openai.images.edit({

          model:
            "gpt-image-2",

          image:
            inputFile,

          prompt:
            prepPrompt,

          quality,

          size:
            "1024x1024",

          background:
            removeBackground
              ? "transparent"
              : "auto",

          output_format:
            "png"
        });


      if (
        !imageResponse ||
        !imageResponse.data ||
        !imageResponse.data[0] ||
        !imageResponse.data[0].b64_json
      ) {

        throw new Error(
          "OpenAI did not return a PNG image."
        );
      }


      const base64Image =
        imageResponse
          .data[0]
          .b64_json;


      const generatedBuffer =
        Buffer.from(
          base64Image,
          "base64"
        );


      let storedPath =
        null;


      if (
        supabaseConfigured
      ) {

        try {

          storedPath =
            await uploadToStorage(
              generatedBuffer,
              `print-ready-${Date.now()}.png`,
              "image/png"
            );

          console.log(
            "✅ Print-ready file stored:",
            storedPath
          );

        } catch (storageError) {

          console.error(
            "⚠️ Print-ready storage failed:",
            storageError.message
          );
        }
      }


      console.log(
        "🎉 PRINT PREP COMPLETE"
      );


      res.json({

        ok:
          true,

        image:
          `data:image/png;base64,${base64Image}`,

        storedPath,

        fileName:
          `sticking-print-ready-${Date.now()}.png`
      });


    } catch (error) {

      console.error(
        "=========================================="
      );

      console.error(
        "❌ PRINT PREP FAILED"
      );

      console.error(
        "=========================================="
      );

      console.error(
        "Error name:",
        error?.name
      );

      console.error(
        "Error message:",
        error?.message
      );

      console.error(
        "Error status:",
        error?.status
      );

      console.error(
        "Error code:",
        error?.code
      );

      console.error(
        "Full error:",
        error
      );


      res
        .status(500)
        .json({

          ok:
            false,

          error:
            error?.message ||
            "Print preparation failed."
        });
    }
  }
);


/* =========================================================
   SMART STICKER SIZE SUGGESTION
   ========================================================= */

app.post(
  "/suggest-size",
  async (req, res) => {

    try {

      const vehicleType =
        cleanText(
          req.body?.vehicleType,
          50
        );

      const make =
        cleanText(
          req.body?.make,
          80
        );

      const model =
        cleanText(
          req.body?.model,
          100
        );

      const year =
        cleanText(
          req.body?.year,
          10
        );

      const part =
        cleanText(
          req.body?.part,
          100
        );


      if (
        !vehicleType ||
        !part
      ) {

        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Vehicle type and panel are required."
          });
      }


      /*
         IMPORTANT:
         These are starting estimates only.
         They are NOT factory measurements.
      */

      const fallback = {

        Car: {

          door:
            [75, 32],

          "rear door":
            [70, 30],

          "side panel":
            [90, 36],

          "rear quarter panel":
            [70, 32],

          fender:
            [48, 25],

          bonnet:
            [120, 55],

          roof:
            [130, 80],

          tailgate:
            [105, 50],

          windshield:
            [95, 28],

          window:
            [55, 25]
        },


        SUV: {

          door:
            [80, 35],

          "rear door":
            [75, 32],

          "side panel":
            [100, 40],

          "rear quarter panel":
            [78, 34],

          fender:
            [50, 26],

          bonnet:
            [130, 58],

          roof:
            [145, 85],

          tailgate:
            [110, 52],

          windshield:
            [100, 30],

          window:
            [58, 26]
        },


        Bike: {

          "fuel tank":
            [28, 18],

          "side panel":
            [24, 16],

          fairing:
            [45, 22],

          fender:
            [25, 14]
        },


        Scooter: {

          "front apron":
            [36, 22],

          "side panel":
            [30, 18],

          fender:
            [26, 14]
        },


        Truck: {

          "cab door":
            [75, 35],

          door:
            [75, 35],

          "truck side body":
            [180, 70],

          "side panel":
            [140, 55],

          bonnet:
            [110, 45],

          windshield:
            [110, 35]
        },


        Van: {

          "side panel":
            [140, 55],

          door:
            [75, 35],

          "rear door":
            [100, 45],

          tailgate:
            [110, 50],

          window:
            [65, 30]
        },


        Bus: {

          "bus side panel":
            [220, 80],

          "side panel":
            [220, 80],

          window:
            [100, 35]
        },


        Commercial: {

          "side panel":
            [160, 60],

          door:
            [80, 35],

          "rear panel":
            [120, 50]
        },


        Other: {

          "side panel":
            [80, 35],

          door:
            [70, 30]
        }
      };


      const map =
        fallback[
          vehicleType
        ] ||
        fallback.Other;


      let values =
        map[
          part
        ] ||
        map[
          "side panel"
        ] ||
        [80, 35];


      let widthCm =
        values[0];

      let heightCm =
        values[1];


      let sourceLabel =
        "General vehicle/panel estimate";


      /*
         AI-assisted suggestion:
         Only when make and model are supplied.
      */

      if (
        openaiConfigured &&
        openai &&
        make &&
        model
      ) {

        try {

          const response =
            await openai.chat.completions.create({

              model:
                "gpt-4.1-mini",

              temperature:
                0.1,

              response_format:
                {
                  type:
                    "json_object"
                },

              messages: [

                {
                  role:
                    "system",

                  content:
                    "Estimate a conservative starting sticker size in centimetres for the specified vehicle panel. This is only an estimate, never an exact factory measurement. Return JSON only with numeric widthCm and heightCm."
                },

                {
                  role:
                    "user",

                  content:
                    JSON.stringify({

                      vehicleType,

                      make,

                      model,

                      year,

                      panel:
                        part,

                      fallbackWidthCm:
                        widthCm,

                      fallbackHeightCm:
                        heightCm
                    })
                }
              ]
            });


          const raw =
            response
              ?.choices?.[0]
              ?.message
              ?.content;


          if (
            raw
          ) {

            const parsed =
              JSON.parse(
                raw
              );


            const aiWidth =
              Number(
                parsed.widthCm
              );

            const aiHeight =
              Number(
                parsed.heightCm
              );


            if (

              Number.isFinite(
                aiWidth
              ) &&

              Number.isFinite(
                aiHeight
              ) &&

              aiWidth >= 5 &&
              aiWidth <= 400 &&

              aiHeight >= 5 &&
              aiHeight <= 200

            ) {

              widthCm =
                Math.round(
                  aiWidth * 10
                ) / 10;

              heightCm =
                Math.round(
                  aiHeight * 10
                ) / 10;

              sourceLabel =
                "AI-assisted estimate";
            }
          }

        } catch (aiError) {

          console.warn(
            "⚠️ Smart size AI unavailable; using fallback:",
            aiError?.message ||
            aiError
          );
        }
      }


      res.json({

        success:
          true,

        widthCm,

        heightCm,

        sourceLabel,

        verified:
          false
      });


    } catch (error) {

      console.error(
        "❌ SMART SIZE ERROR:",
        error
      );

      res
        .status(500)
        .json({

          success:
            false,

          error:
            error?.message ||
            "Could not calculate a recommended size."
        });
    }
  }
);


/* =========================================================
   404 HANDLER
   ========================================================= */

app.use(
  (req, res) => {

    console.log(
      `❌ 404 ROUTE NOT FOUND: ${req.method} ${req.path}`
    );

    res
      .status(404)
      .json({

        ok:
          false,

        error:
          "Route not found",

        path:
          req.path
      });
  }
);


/* =========================================================
   GLOBAL ERROR HANDLER
   ========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      "❌ GLOBAL SERVER ERROR"
    );

    console.error(
      error
    );

    res
      .status(500)
      .json({

        ok:
          false,

        error:
          error?.message ||
          "Server error"
      });
  }
);


/* =========================================================
   START SERVER
   ========================================================= */

app.listen(
  PORT,
  HOST,
  async () => {

    console.log(
      "=========================================="
    );

    console.log(
      "🚀 SticKing server started"
    );

    console.log(
      `🌐 http://0.0.0.0:${PORT}`
    );

    console.log(
      `🔑 OpenAI configured: ${openaiConfigured}`
    );

    console.log(
      `🗄️ Supabase configured: ${supabaseConfigured}`
    );

    console.log(
      `👑 Admin configured: ${adminConfigured}`
    );

    console.log(
      `📁 Public directory: ${PUBLIC_DIR}`
    );

    console.log(
      "=========================================="
    );

    await ensureStorageBucket();
  }
);
