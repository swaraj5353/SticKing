const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = OpenAI;
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const openaiConfigured = !!OPENAI_API_KEY;
const supabaseConfigured =
  !!SUPABASE_URL && !!SUPABASE_SECRET_KEY;
const adminConfigured = !!ADMIN_PASSWORD;

const openai = openaiConfigured
  ? new OpenAI({
      apiKey: OPENAI_API_KEY
    })
  : null;


/* =========================================================
   SUPABASE URL
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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();

});


/* =========================================================
   BODY PARSING
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
   SUPABASE HELPERS
   ========================================================= */

function supabaseHeaders() {

  return {
    "apikey": SUPABASE_SECRET_KEY,
    "Authorization":
      `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json"
  };

}


async function supabaseRequest(
  path,
  options = {}
) {

  if (!supabaseConfigured) {
    throw new Error(
      "Supabase is not configured."
    );
  }

  const response = await fetch(
    `${supabaseBaseUrl}${path}`,
    {
      ...options,

      headers: {
        ...supabaseHeaders(),
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
      : null;
  } catch {
    data = text;
  }

  if (!response.ok) {

    const message =
      data?.message ||
      data?.error ||
      data?.msg ||
      text ||
      `Supabase error ${response.status}`;

    throw new Error(message);

  }

  return data;

}


/* =========================================================
   STORAGE
   ========================================================= */

const STORAGE_BUCKET = "vehicle-orders";


async function ensureStorageBucket() {

  if (!supabaseConfigured) {
    return;
  }

  try {

    const response = await fetch(
      `${supabaseBaseUrl}/storage/v1/bucket`,
      {
        method: "POST",

        headers: {
          ...supabaseHeaders()
        },

        body: JSON.stringify({
          id: STORAGE_BUCKET,
          name: STORAGE_BUCKET,
          public: false
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

    const text = await response.text();

    console.log(
      "⚠️ Could not create storage bucket:",
      text
    );

  } catch (error) {

    console.log(
      "⚠️ Storage bucket check failed:",
      error.message
    );

  }

}


async function uploadToStorage(
  buffer,
  fileName,
  contentType
) {

  const path =
    `${new Date().getFullYear()}/` +
    `${Date.now()}-${crypto.randomUUID()}-${fileName}`;

  const response = await fetch(
    `${supabaseBaseUrl}/storage/v1/object/` +
    `${STORAGE_BUCKET}/${encodeURIComponent(path)}`,
    {
      method: "POST",

      headers: {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization":
          `Bearer ${SUPABASE_SECRET_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "false"
      },

      body: buffer
    }
  );

  const text = await response.text();

  if (!response.ok) {

    throw new Error(
      `Storage upload failed: ${text}`
    );

  }

  return path;

}


async function createSignedUrl(path) {

  if (!path) {
    return null;
  }

  try {

    const response = await fetch(
      `${supabaseBaseUrl}/storage/v1/object/sign/` +
      `${STORAGE_BUCKET}/${encodeURIComponent(path)}`,

      {
        method: "POST",

        headers: {
          ...supabaseHeaders()
        },

        body: JSON.stringify({
          expiresIn: 60 * 60 * 24
        })
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return null;
    }

    const data = JSON.parse(text);

    if (!data.signedURL) {
      return null;
    }

    return `${supabaseBaseUrl}/storage/v1${data.signedURL}`;

  } catch {

    return null;

  }

}


/* =========================================================
   ORDER DATABASE
   ========================================================= */

async function createOrder(order) {

  const result = await supabaseRequest(
    "/rest/v1/orders",
    {
      method: "POST",

      headers: {
        "Prefer": "return=representation"
      },

      body: JSON.stringify(order)
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

  const result = await supabaseRequest(
    `/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,

    {
      method: "PATCH",

      headers: {
        "Prefer": "return=representation"
      },

      body: JSON.stringify(updates)
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

      ok: true,

      service:
        "SticKing AI Vehicle Customizer",

      status: "running",

      openaiConfigured,

      supabaseConfigured,

      adminConfigured

    });

  }
);


/* =========================================================
   HOME
   ========================================================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      __dirname +
      "/public/index.html"
    );

  }
);


/* =========================================================
   ADMIN PAGE
   ========================================================= */

app.get(
  "/admin",
  (req, res) => {

    res.sendFile(
      __dirname +
      "/public/admin.html"
    );

  }
);


/* =========================================================
   ADMIN LOGIN
   ========================================================= */

app.post(
  "/api/admin/login",
  (req, res) => {

    if (!adminConfigured) {

      return res.status(500).json({
        ok: false,
        error:
          "ADMIN_PASSWORD is not configured."
      });

    }

    const password =
      req.body?.password || "";

    if (
      password !== ADMIN_PASSWORD
    ) {

      return res.status(401).json({
        ok: false,
        error:
          "Incorrect admin password."
      });

    }

    res.json({
      ok: true,
      message: "Admin login successful."
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

  if (!adminConfigured) {

    return res.status(500).json({
      ok: false,
      error:
        "ADMIN_PASSWORD is not configured."
    });

  }

  const password =
    req.headers["x-admin-password"];

  if (
    !password ||
    password !== ADMIN_PASSWORD
  ) {

    return res.status(401).json({
      ok: false,
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

          (orders || []).map(
            async order => {

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

      res.json({

        ok: true,

        orders: enriched

      });

    } catch (error) {

      console.error(
        "❌ ADMIN ORDERS ERROR:",
        error
      );

      res.status(500).json({

        ok: false,

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
        !allowedStatuses.includes(status)
      ) {

        return res.status(400).json({

          ok: false,

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

      res.json({

        ok: true,

        order: updated

      });

    } catch (error) {

      console.error(
        "❌ UPDATE ORDER ERROR:",
        error
      );

      res.status(500).json({

        ok: false,

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

      const body = req.body || {};

      const order = {

        customer_name:
          body.customer_name || null,

        customer_email:
          body.customer_email || null,

        customer_phone:
          body.customer_phone || null,

        vehicle:
          body.vehicle || null,

        design:
          body.design || null,

        part:
          body.part || null,

        width:
          body.width || null,

        height:
          body.height || null,

        description:
          body.description || null,

        amount:
          body.amount || 0,

        status:
          "new"

      };

      const created =
        await createOrder(order);

      res.json({

        ok: true,

        order: created

      });

    } catch (error) {

      console.error(
        "❌ CREATE ORDER ERROR:",
        error
      );

      res.status(500).json({

        ok: false,

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


    let orderId = null;

    try {

      if (
        !openaiConfigured ||
        !openai
      ) {

        return res.status(500).json({

          ok: false,

          error:
            "OpenAI API key is not configured."

        });

      }


      if (!req.file) {

        return res.status(400).json({

          ok: false,

          error:
            "No vehicle image was uploaded."

        });

      }


      const design =
        req.body.design || "";

      const width =
        req.body.width || "";

      const height =
        req.body.height || "";

      const description =
        req.body.description || "";

      const part =
        req.body.part ||
        req.body.vehiclePart ||
        "";

      const vehicle =
        req.body.vehicle ||
        req.body.vehicleModel ||
        "";

      const customerName =
        req.body.customer_name ||
        req.body.customerName ||
        "";

      const customerEmail =
        req.body.customer_email ||
        req.body.customerEmail ||
        "";

      const customerPhone =
        req.body.customer_phone ||
        req.body.customerPhone ||
        "";

      const amount =
        req.body.amount || 0;


      console.log(
        "📷 Image:",
        req.file.originalname
      );

      console.log(
        "🎨 Design:",
        design
      );

      console.log(
        "🚗 Vehicle:",
        vehicle
      );


      /* -----------------------------------------------------
         SAVE ORIGINAL IMAGE
         ----------------------------------------------------- */

      let originalImagePath = null;

      if (supabaseConfigured) {

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

      if (supabaseConfigured) {

        try {

          const created =
            await createOrder({

              customer_name:
                customerName || null,

              customer_email:
                customerEmail || null,

              customer_phone:
                customerPhone || null,

              vehicle:
                vehicle || null,

              design:
                design || null,

              part:
                part || null,

              width:
                width || null,

              height:
                height || null,

              description:
                description || null,

              amount:
                amount || 0,

              status:
                "processing",

              original_image_path:
                originalImagePath,

              generated_image_path:
                null

            });


          orderId =
            created?.id || null;


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
         PROMPT
         ----------------------------------------------------- */

      const prompt = `

You are a professional vehicle sticker
and vinyl wrap designer.

Edit the uploaded vehicle photograph
to create a realistic preview of the
requested sticker/design applied to
the vehicle.

IMPORTANT:

- Keep the original vehicle recognizable.
- Keep the exact vehicle model.
- Keep the body shape and proportions.
- Keep the original camera perspective.
- Keep the original background whenever possible.
- Do not replace the vehicle.
- Do not create a completely different car.
- Apply the requested sticker naturally.
- Make the sticker look professionally installed.
- Follow the vehicle's body curves.
- Respect doors, bonnet, windows and body panels.
- Preserve realistic reflections.
- Preserve realistic lighting.
- Preserve realistic shadows.
- Do not make the sticker float beside the vehicle.
- The final result must look like a real photograph.

Vehicle:
${vehicle}

Vehicle part:
${part}

Sticker/design:
${design}

Dimensions:
${width} cm × ${height} cm

Customer instructions:
${description}

Create a premium, realistic vehicle
customization preview.
`;


      console.log(
        "🤖 Sending image to OpenAI..."
      );


      /* -----------------------------------------------------
         OPENAI IMAGE EDIT
         ----------------------------------------------------- */

      const inputFile =
        await toFile(
          req.file.buffer,
          req.file.originalname,
          {
            type:
              req.file.mimetype
          }
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


      console.log(
        "✅ OpenAI response received."
      );


      if (
        !imageResponse ||
        !imageResponse.data ||
        !imageResponse.data[0]
      ) {

        throw new Error(
          "OpenAI did not return an image."
        );

      }


      const result =
        imageResponse.data[0];


      if (!result.b64_json) {

        throw new Error(
          "OpenAI returned no base64 image."
        );

      }


      const generatedBuffer =
        Buffer.from(
          result.b64_json,
          "base64"
        );


      /* -----------------------------------------------------
         SAVE GENERATED IMAGE
         ----------------------------------------------------- */

      let generatedImagePath =
        null;


      if (supabaseConfigured) {

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


          if (orderId) {

            await updateOrder(
              orderId,
              {
                generated_image_path:
                  generatedImagePath,

                status:
                  "new"
              }
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


      return res.json({

        ok: true,

        orderId,

        image:
          `data:image/png;base64,${result.b64_json}`

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
        "Error:",
        error
      );


      if (orderId) {

        try {

          await updateOrder(
            orderId,
            {
              status:
                "cancelled"
            }
          );

        } catch {}

      }


      return res.status(500).json({

        ok: false,

        error:
          error.message ||
          "Image generation failed.",

        orderId

      });

    }

  }
);


/* =========================================================
   404
   ========================================================= */

app.use(
  (req, res) => {

    res.status(404).json({

      ok: false,

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
      "=========================================="
    );


    await ensureStorageBucket();

  }
);
