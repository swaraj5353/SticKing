const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const path = require("path");

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT =
  Number(process.env.PORT) || 10000;

const HOST =
  "0.0.0.0";

const MAX_IMAGE_SIZE =
  20 * 1024 * 1024;


/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "";

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || "";

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "";

const RAZORPAY_KEY_ID =
  process.env.RAZORPAY_KEY_ID || "";

const RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET || "";

const RAZORPAY_MODE =
  (
    process.env.RAZORPAY_MODE ||
    "test"
  ).toLowerCase();

const STICKING_DEFAULT_PRICE_INR =
  Number(
    process.env.STICKING_DEFAULT_PRICE_INR ||
    500
  );


/* =========================================================
   CONFIGURATION STATUS
========================================================= */

const openaiConfigured =
  !!OPENAI_API_KEY;

const supabaseConfigured =
  !!SUPABASE_URL &&
  !!SUPABASE_SECRET_KEY;

const adminConfigured =
  !!ADMIN_PASSWORD;

const razorpayConfigured =
  !!RAZORPAY_KEY_ID &&
  !!RAZORPAY_KEY_SECRET;


/* =========================================================
   OPENAI CLIENT
========================================================= */

const openai =
  openaiConfigured
    ? new OpenAI({
        apiKey:
          OPENAI_API_KEY
      })
    : null;


/* =========================================================
   RAZORPAY CLIENT
========================================================= */

const razorpay =
  razorpayConfigured
    ? new Razorpay({
        key_id:
          RAZORPAY_KEY_ID,

        key_secret:
          RAZORPAY_KEY_SECRET
      })
    : null;


/* =========================================================
   PUBLIC DIRECTORY
========================================================= */

const PUBLIC_DIR =
  path.join(
    __dirname,
    "public"
  );


/* =========================================================
   SUPABASE BASE URL
========================================================= */

const supabaseBaseUrl =
  SUPABASE_URL
    ? SUPABASE_URL
        .replace(
          /\/rest\/v1\/?$/,
          ""
        )
        .replace(
          /\/$/,
          ""
        )
    : "";


/* =========================================================
   STORAGE
========================================================= */

const STORAGE_BUCKET =
  "vehicle-orders";


/* =========================================================
   STARTUP LOGS
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
  razorpayConfigured
    ? `✅ Razorpay is configured (${RAZORPAY_MODE} mode).`
    : "❌ Razorpay is NOT configured."
);

console.log(
  `📁 Public directory: ${PUBLIC_DIR}`
);


/* =========================================================
   STATIC FILES
========================================================= */

app.use(
  express.static(
    PUBLIC_DIR,
    {
      extensions:
        ["html"],

      index:
        "index.html"
    }
  )
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
      allowedOrigins.includes(
        origin
      )
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
      req.method ===
      "OPTIONS"
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
    limit:
      "30mb"
  })
);

app.use(
  express.urlencoded({
    extended:
      true,

    limit:
      "20mb"
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
   IMAGE UPLOAD
========================================================= */

const upload =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {

      fileSize:
        MAX_IMAGE_SIZE,

      files:
        1

    },

    fileFilter:
      (
        req,
        file,
        callback
      ) => {

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


        callback(
          null,
          true
        );

      }

  });


/* =========================================================
   HELPER
========================================================= */

function cleanText(
  value,
  maxLength
) {

  if (
    value ===
    undefined ||

    value ===
    null
  ) {

    return "";

  }


  return String(
    value
  )
    .trim()
    .slice(
      0,
      maxLength
    );

}



/* =========================================================
   SHIPPING ADDRESS HELPERS
   Stored in the existing orders.description field so
   no new database table is required.
========================================================= */

const SHIPPING_MARKER =
  "\n\n[STICKING_SHIPPING_ADDRESS]\n";

function buildShippingMarker(address) {
  return SHIPPING_MARKER +
    JSON.stringify({
      full_name: address.full_name || "",
      phone: address.phone || "",
      email: address.email || "",
      line1: address.line1 || "",
      line2: address.line2 || "",
      landmark: address.landmark || "",
      city: address.city || "",
      state: address.state || "",
      pincode: address.pincode || "",
      country: address.country || "India",
      shipping_method: address.shipping_method || "India Post",
      tracking_number: address.tracking_number || "",
      shipping_status: address.shipping_status || "pending"
    });
}

function extractShippingAddress(description) {
  if (!description || typeof description !== "string") {
    return null;
  }

  const index = description.lastIndexOf(SHIPPING_MARKER);
  if (index < 0) {
    return null;
  }

  const jsonText =
    description
      .slice(index + SHIPPING_MARKER.length)
      .trim();

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function stripShippingMarker(description) {
  if (!description || typeof description !== "string") {
    return "";
  }

  const index = description.lastIndexOf(SHIPPING_MARKER);

  if (index < 0) {
    return description;
  }

  return description.slice(0, index).trim();
}

function validateIndianPincode(pincode) {
  return /^[1-9][0-9]{5}$/.test(
    String(pincode || "").trim()
  );
}

function validateIndianPhone(phone) {
  return /^[6-9][0-9]{9}$/.test(
    String(phone || "")
      .replace(/\D/g, "")
      .slice(-10)
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


  let data =
    null;


  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    data =
      text;

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
   STORAGE BUCKET
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
      response.status ===
        409
    ) {

      console.log(
        `🗄️ Storage bucket ready: ${STORAGE_BUCKET}`
      );

      return;

    }


    const text =
      await response.text();


    console.warn(
      "⚠️ Storage bucket warning:",
      text
    );

  } catch (
    error
  ) {

    console.warn(
      "⚠️ Storage bucket check failed:",
      error.message
    );

  }

}


/* =========================================================
   UPLOAD FILE TO SUPABASE
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

      `${supabaseBaseUrl}` +
      `/storage/v1/object/` +
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
   SIGNED STORAGE URL
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
                86400

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
      JSON.parse(
        text
      );


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

  } catch (
    error
  ) {

    console.error(
      "❌ Signed URL creation failed:",
      error.message
    );

    return null;

  }

}


/* =========================================================
   SUPABASE ORDER HELPERS
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
   HEALTH CHECK
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok:
        true,

      service:
        "SticKing",

      status:
        "running",

      openaiConfigured,

      supabaseConfigured,

      adminConfigured,

      razorpayConfigured,

      razorpayMode:
        RAZORPAY_MODE

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
      path.join(
        PUBLIC_DIR,
        "index.html"
      )
    );

  }
);


/* =========================================================
   GALLERY
========================================================= */

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


/* =========================================================
   ADMIN
========================================================= */

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


    res.json({

      ok:
        true,

      message:
        "Admin login successful."

    });

  }
);


/* =========================================================
   ADMIN AUTH
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
   ADMIN ORDERS
========================================================= */

app.get(
  "/api/admin/orders",
  requireAdmin,
  async (
    req,
    res
  ) => {

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
              async (
                order
              ) => {

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

                  shipping_address:
                    extractShippingAddress(
                      order.description || ""
                    ),

                  customer_instructions:
                    stripShippingMarker(
                      order.description || ""
                    ),

                  original_image_url:
                    originalUrl,

                  generated_image_url:
                    generatedUrl

                };

              }
            )

        );


      res.json({

        ok:
          true,

        orders:
          enriched

      });

    } catch (
      error
    ) {

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
   ADMIN UPDATE ORDER STATUS
========================================================= */

app.patch(
  "/api/admin/orders/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {

    try {

      const allowedStatuses = [

        "new",

        "processing",

        "paid",

        "shipped",

        "completed",

        "cancelled"

      ];


      const status =
        req.body?.status;


      if (
        !allowedStatuses.includes(
          status
        )
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


      res.json({

        ok:
          true,

        order:
          updated

      });

    } catch (
      error
    ) {

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
   SAVE CUSTOMER SHIPPING ADDRESS
========================================================= */

app.post(
  "/api/save-shipping",
  async (req, res) => {

    try {

      if (!supabaseConfigured) {
        return res.status(500).json({
          ok: false,
          success: false,
          error: "Supabase is not configured."
        });
      }

      const orderId =
        cleanText(
          req.body?.orderId ||
          req.body?.localOrderId,
          100
        );

      if (!orderId) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: "Order ID is required."
        });
      }

      const address = {
        full_name:
          cleanText(req.body?.full_name, 120),

        phone:
          cleanText(req.body?.phone, 30),

        email:
          cleanText(req.body?.email, 160),

        line1:
          cleanText(req.body?.line1, 200),

        line2:
          cleanText(req.body?.line2, 200),

        landmark:
          cleanText(req.body?.landmark, 160),

        city:
          cleanText(req.body?.city, 100),

        state:
          cleanText(req.body?.state, 100),

        pincode:
          cleanText(req.body?.pincode, 6),

        country:
          cleanText(req.body?.country, 50) ||
          "India",

        shipping_method:
          cleanText(req.body?.shipping_method, 80) ||
          "India Post",

        tracking_number:
          cleanText(req.body?.tracking_number, 80),

        shipping_status:
          "pending"
      };

      if (!address.full_name) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: "Full name is required."
        });
      }

      if (!validateIndianPhone(address.phone)) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: "Please enter a valid 10-digit Indian mobile number."
        });
      }

      if (address.email &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: "Please enter a valid email address."
        });
      }

      if (!address.line1) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: "House/flat and street address are required."
        });
      }

      if (!address.city || !address.state) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: "City and state are required."
        });
      }

      if (!validateIndianPincode(address.pincode)) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: "Please enter a valid 6-digit Indian pincode."
        });
      }

      const existing =
        await supabaseRequest(
          `/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,description`,
          { method: "GET" }
        );

      if (!Array.isArray(existing) || !existing[0]) {
        return res.status(404).json({
          ok: false,
          success: false,
          error: "Order not found."
        });
      }

      const baseDescription =
        stripShippingMarker(
          existing[0].description || ""
        );

      const newDescription =
        baseDescription +
        buildShippingMarker(address);

      const updated =
        await updateOrder(
          orderId,
          {
            customer_name:
              address.full_name,

            customer_phone:
              address.phone,

            customer_email:
              address.email || null,

            description:
              newDescription
          }
        );

      res.json({
        ok: true,
        success: true,
        order: updated,
        shipping_address: address
      });

    } catch (error) {

      console.error(
        "❌ SAVE SHIPPING ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        success: false,
        error:
          error.message ||
          "Could not save shipping address."
      });
    }
  }
);


/* =========================================================
   ADMIN SHIPPING UPDATE
========================================================= */

app.patch(
  "/api/admin/orders/:id/shipping",
  requireAdmin,
  async (req, res) => {

    try {

      const orderId =
        cleanText(
          req.params.id,
          100
        );

      const existing =
        await supabaseRequest(
          `/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,description`,
          { method: "GET" }
        );

      if (!Array.isArray(existing) || !existing[0]) {
        return res.status(404).json({
          ok: false,
          error: "Order not found."
        });
      }

      const current =
        extractShippingAddress(
          existing[0].description || ""
        ) || {};

      const shipping = {
        ...current,

        shipping_status:
          cleanText(
            req.body?.shipping_status,
            40
          ) || current.shipping_status || "pending",

        tracking_number:
          cleanText(
            req.body?.tracking_number,
            80
          ) || current.tracking_number || "",

        shipping_method:
          cleanText(
            req.body?.shipping_method,
            80
          ) || current.shipping_method || "India Post"
      };

      const description =
        stripShippingMarker(
          existing[0].description || ""
        ) +
        buildShippingMarker(shipping);

      const updated =
        await updateOrder(
          orderId,
          {
            description
          }
        );

      res.json({
        ok: true,
        order: updated,
        shipping_address: shipping
      });

    } catch (error) {

      console.error(
        "❌ ADMIN SHIPPING UPDATE ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Could not update shipping details."
      });
    }
  }
);


/* =========================================================
   CREATE ORDER
========================================================= */

app.post(
  "/api/orders",
  async (
    req,
    res
  ) => {

    try {

      if (
        !supabaseConfigured
      ) {

        return res
          .status(500)
          .json({

            ok:
              false,

            error:
              "Supabase is not configured."

          });

      }


      const body =
        req.body || {};


      const created =
        await createOrder({

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

        });


      res.json({

        ok:
          true,

        order:
          created

      });

    } catch (
      error
    ) {

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
   SMART STICKER SIZE SUGGESTION
========================================================= */

app.post(
  "/suggest-size",
  async (
    req,
    res
  ) => {

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
       * These are conservative starting estimates.
       * They are NOT factory measurements.
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


      const vehicleMap =
        fallback[
          vehicleType
        ] ||
        fallback.Other;


      let size =
        vehicleMap[
          part
        ] ||
        vehicleMap[
          "side panel"
        ] ||
        [80, 35];


      let widthCm =
        size[0];


      let heightCm =
        size[1];


      let sourceLabel =
        "General vehicle/panel estimate";


      /*
       * AI assistance is optional.
       * If make + model are supplied,
       * ask the model for a conservative estimate.
       */

      if (
        openaiConfigured &&
        openai &&
        make &&
        model
      ) {

        try {

          const ai =
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
                    "Estimate a conservative starting vinyl decal size in centimetres for a specified vehicle panel. This is NOT an exact factory measurement. Return only JSON with widthCm and heightCm."

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
            ai
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


            const w =
              Number(
                parsed.widthCm
              );


            const h =
              Number(
                parsed.heightCm
              );


            if (

              Number.isFinite(
                w
              ) &&

              Number.isFinite(
                h
              ) &&

              w >= 5 &&
              w <= 400 &&

              h >= 5 &&
              h <= 200

            ) {

              widthCm =
                Math.round(
                  w * 10
                ) / 10;


              heightCm =
                Math.round(
                  h * 10
                ) / 10;


              sourceLabel =
                "AI-assisted estimate";

            }

          }

        } catch (
          error
        ) {

          console.warn(
            "⚠️ Smart size AI unavailable; using fallback.",
            error.message
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

    } catch (
      error
    ) {

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
            error.message ||
            "Could not calculate sticker size."

        });

    }

  }
);


/* =========================================================
   GENERATE VEHICLE PREVIEW
========================================================= */

app.post(
  "/generate-preview",
  upload.single(
    "vehicleImage"
  ),
  async (
    req,
    res
  ) => {

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

            success:
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

            success:
              false,

            error:
              "No vehicle image was uploaded."

          });

      }


      const design =
        cleanText(
          req.body?.design,
          2000
        );


      const description =
        cleanText(
          req.body?.description,
          2000
        );


      const extra =
        cleanText(
          req.body?.extra,
          1500
        );


      const part =
        cleanText(
          req.body?.part,
          100
        );


      const width =
        cleanText(
          req.body?.width ||
          req.body?.widthCm,
          30
        );


      const height =
        cleanText(
          req.body?.height ||
          req.body?.heightCm,
          30
        );


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
          req.body?.model ||
          req.body?.vehicleModel,
          100
        );


      const year =
        cleanText(
          req.body?.year,
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


      /*
       * Store original image.
       */

      let originalImagePath =
        null;


      if (
        supabaseConfigured
      ) {

        try {

          originalImagePath =
            await uploadToStorage(

              req.file.buffer,

              req.file.originalname ||
              "vehicle.png",

              req.file.mimetype

            );

        } catch (
          error
        ) {

          console.warn(
            "⚠️ Original image could not be stored:",
            error.message
          );

        }

      }


      /*
       * Create preliminary Supabase order.
       */

      if (
        supabaseConfigured
      ) {

        try {

          const created =
            await createOrder({

              customer_name:
                null,

              customer_email:
                null,

              customer_phone:
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

        } catch (
          error
        ) {

          console.warn(
            "⚠️ Preliminary order could not be created:",
            error.message
          );

        }

      }


      /*
       * AI PROMPT
       */

      const prompt = `

You are a professional automotive vinyl
decal preview designer.

Edit the uploaded vehicle photograph
to create a realistic preview of the
requested sticker/decal.

IMPORTANT:

Keep the original vehicle.

Do not replace the vehicle.

Keep the exact vehicle model whenever
it is visible.

Preserve the body shape and proportions.

Preserve the original camera perspective.

Preserve the original environment as
much as possible.

Apply the requested sticker naturally
to the requested panel.

Follow real vehicle curves.

Respect doors, handles, windows,
fenders, bonnets, fuel tanks and
body panel lines.

Preserve realistic reflections.

Preserve realistic lighting.

Preserve realistic shadows.

Do not create a rectangular pasted image.

Do not make the sticker float beside
the vehicle.

Do not add unrelated artwork.

The sticker should look professionally
installed.

Vehicle type:
${vehicleType}

Vehicle:
${vehicle}

Selected panel:
${part}

Sticker dimensions:
${width} cm × ${height} cm

Design requested:
${design || description}

Customer description:
${description}

Additional placement instructions:
${extra}

Create a premium realistic
vehicle customization preview.

`;


      console.log(
        "🤖 Sending vehicle image to OpenAI..."
      );


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


      /*
       * CUSTOMER PREVIEW:
       * GPT-Image-1 Mini
       */

      const imageResponse =
        await openai.images.edit({

          model:
            "gpt-image-1-mini",

          image:
            inputFile,

          prompt,

          size:
            "1024x1024"

        });


      if (
        !imageResponse?.data?.[0]?.b64_json
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


      /*
       * Store AI preview.
       */

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

          }

        } catch (
          storageError
        ) {

          console.warn(
            "⚠️ Generated image storage failed:",
            storageError.message
          );

        }

      }


      console.log(
        "🎉 VEHICLE PREVIEW COMPLETE"
      );


      res.json({

        ok:
          true,

        success:
          true,

        orderId,

        image:
          `data:image/png;base64,${base64Image}`

      });


    } catch (
      error
    ) {

      console.error(
        "❌ GENERATE PREVIEW ERROR:",
        error
      );


      if (
        orderId &&
        supabaseConfigured
      ) {

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


      res
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
   REFINE VEHICLE PREVIEW
========================================================= */

app.post(
  "/refine-preview",
  async (
    req,
    res
  ) => {

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


      const width =
        cleanText(
          req.body?.width ||
          req.body?.widthCm,
          30
        );


      const height =
        cleanText(
          req.body?.height ||
          req.body?.heightCm,
          30
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


      const cleanBase64 =
        String(
          previousImageBase64
        )
          .replace(
            /^data:image\/[^;]+;base64,/,
            ""
          );


      const buffer =
        Buffer.from(
          cleanBase64,
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
              "Previous preview could not be read."

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


      const prompt = `

Refine the existing vehicle decal preview.

IMPORTANT:

Keep the same vehicle.

Keep the same vehicle model.

Keep the same body shape.

Keep the same camera perspective.

Keep the existing design recognizable.

Do not redesign unrelated parts.

Do not replace the vehicle.

Requested vehicle:
${vehicleType} ${make} ${model} ${year}

Panel:
${part}

Sticker dimensions:
${width} cm × ${height} cm

Requested refinement:
${refinement}

Make only the requested changes.

Maintain realistic vinyl application,
perspective, lighting, reflections
and shadows.

`;


      const result =
        await openai.images.edit({

          model:
            "gpt-image-1-mini",

          image:
            inputFile,

          prompt,

          size:
            "1024x1024"

        });


      if (
        !result?.data?.[0]?.b64_json
      ) {

        throw new Error(
          "OpenAI did not return a refined image."
        );

      }


      const base64Image =
        result
          .data[0]
          .b64_json;


      res.json({

        ok:
          true,

        success:
          true,

        image:
          `data:image/png;base64,${base64Image}`

      });


    } catch (
      error
    ) {

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
  async (
    req,
    res
  ) => {

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


      const prompt = `

Create a standalone professional
vehicle decal/tattoo graphic.

Design:
${description}

Requirements:

Clean vinyl decal artwork.

Bold clear shapes.

Clean outlines.

Suitable for sticker production.

No vehicle.

No mockup.

No road.

No floor.

No unrelated objects.

No rectangular background.

Isolated artwork only.

Transparent background.

Suitable for PNG decal production.

`;


      const result =
        await openai.images.generate({

          model:
            "gpt-image-1-mini",

          prompt,

          size:
            "1024x1024"

        });


      if (
        !result?.data?.[0]?.b64_json
      ) {

        throw new Error(
          "OpenAI returned no decal image."
        );

      }


      const base64Image =
        result
          .data[0]
          .b64_json;


      res.json({

        ok:
          true,

        success:
          true,

        image:
          `data:image/png;base64,${base64Image}`,

        fileName:
          `sticking-decal-${Date.now()}.png`

      });


    } catch (
      error
    ) {

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
            "Could not generate decal."

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
  upload.single(
    "image"
  ),
  async (
    req,
    res
  ) => {

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
        ) !==
        "false";


      const inputFile =
        await toFile(

          req.file.buffer,

          req.file.originalname ||
          "artwork.png",

          {
            type:
              req.file.mimetype
          }

        );


      const prompt = `

You are SticKing's private
professional sticker print-preparation
agent.

Your job is to prepare the uploaded
artwork for sticker/vinyl production.

Do NOT redesign the artwork.

Preserve the original composition.

Preserve proportions.

Preserve logos.

Preserve text.

Preserve colours as closely as possible.

Remove unwanted background.

Remove excess surrounding material.

Reduce obvious noise.

Reduce compression artifacts.

Clean jagged edges.

Clean rough edges.

Make the artwork crisp.

Do not invent new details.

Do not add unrelated artwork.

Do not crop actual artwork.

Do not distort the artwork.

Do not turn the design into a different
artistic interpretation.

${
  removeBackground
    ? "Return the artwork with a transparent background."
    : "Keep the background only where it genuinely belongs to the artwork."
}

`;


      /*
       * Higher-quality internal
       * production-prep step.
       */

      const imageResponse =
        await openai.images.edit({

          model:
            "gpt-image-2",

          image:
            inputFile,

          prompt,

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
        !imageResponse?.data?.[0]?.b64_json
      ) {

        throw new Error(
          "OpenAI did not return a PNG."
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

        } catch (
          error
        ) {

          console.warn(
            "⚠️ Print-ready storage failed:",
            error.message
          );

        }

      }


      res.json({

        ok:
          true,

        image:
          `data:image/png;base64,${base64Image}`,

        storedPath,

        fileName:
          `sticking-print-ready-${Date.now()}.png`

      });


    } catch (
      error
    ) {

      console.error(
        "❌ PRINT PREP ERROR:",
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
   RAZORPAY - CREATE ORDER
========================================================= */

app.post(
  "/api/create-order",
  async (
    req,
    res
  ) => {

    try {

      if (
        !razorpayConfigured ||
        !razorpay
      ) {

        return res
          .status(500)
          .json({

            ok:
              false,

            success:
              false,

            error:
              "Razorpay is not configured on the server."

          });

      }


      let amountPaise =
        Number(
          req.body?.amount
        );


      /*
       * If frontend doesn't send
       * an amount, use the Render
       * configured default.
       */

      if (
        !Number.isInteger(
          amountPaise
        ) ||
        amountPaise <
          100
      ) {

        if (
          req.body?.amount ===
            undefined ||

          req.body?.amount ===
            null ||

          req.body?.amount ===
            ""
        ) {

          amountPaise =
            Math.round(
              STICKING_DEFAULT_PRICE_INR *
              100
            );

        }

      }


      if (
        !Number.isInteger(
          amountPaise
        ) ||
        amountPaise <
          100
      ) {

        return res
          .status(400)
          .json({

            ok:
              false,

            success:
              false,

            error:
              "Amount must be at least 100 paise (₹1)."

          });

      }


      /*
       * Safety cap.
       */

      if (
        amountPaise >
          1000000000
      ) {

        return res
          .status(400)
          .json({

            ok:
              false,

            success:
              false,

            error:
              "Amount is too large."

          });

      }


      const receipt =
        cleanText(
          req.body?.receipt,
          40
        ) ||
        `sticking_${Date.now()}`;


      console.log(
        "💳 Creating Razorpay order:",
        amountPaise,
        "paise"
      );


      const order =
        await razorpay.orders.create({

          amount:
            amountPaise,

          currency:
            "INR",

          receipt

        });


      res.json({

        ok:
          true,

        success:
          true,

        order_id:
          order.id,

        amount:
          order.amount,

        currency:
          order.currency,

        key_id:
          RAZORPAY_KEY_ID,

        receipt:
          order.receipt,

        mode:
          RAZORPAY_MODE

      });


    } catch (
      error
    ) {

      console.error(
        "❌ RAZORPAY CREATE ORDER ERROR:",
        error
      );


      const status =
        error?.statusCode ===
          401 ||

        error?.status ===
          401

          ? 401
          : 500;


      res
        .status(status)
        .json({

          ok:
            false,

          success:
            false,

          error:

            error?.error?.description ||

            error?.description ||

            error?.message ||

            "Unable to create Razorpay order."

        });

    }

  }
);


/* =========================================================
   RAZORPAY - VERIFY PAYMENT
========================================================= */

app.post(
  "/api/verify-payment",
  async (
    req,
    res
  ) => {

    try {

      if (
        !razorpayConfigured ||
        !razorpay
      ) {

        return res
          .status(500)
          .json({

            ok:
              false,

            success:
              false,

            verified:
              false,

            error:
              "Razorpay is not configured on the server."

          });

      }


      const paymentId =
        req.body
          ?.razorpay_payment_id;


      const orderId =
        req.body
          ?.razorpay_order_id;


      const signature =
        req.body
          ?.razorpay_signature;


      if (
        !paymentId ||
        !orderId ||
        !signature
      ) {

        return res
          .status(400)
          .json({

            ok:
              false,

            success:
              false,

            verified:
              false,

            error:
              "Missing Razorpay payment verification fields."

          });

      }


      /*
       * Fetch order from Razorpay.
       */

      const serverOrder =
        await razorpay.orders.fetch(
          orderId
        );


      if (
        !serverOrder?.id
      ) {

        return res
          .status(400)
          .json({

            ok:
              false,

            success:
              false,

            verified:
              false,

            error:
              "Razorpay order could not be verified."

          });

      }


      /*
       * Fetch payment details.
       */

      const payment =
        await razorpay.payments.fetch(
          paymentId
        );


      if (
        !payment?.order_id ||
        payment.order_id !==
          serverOrder.id
      ) {

        return res
          .status(400)
          .json({

            ok:
              false,

            success:
              false,

            verified:
              false,

            error:
              "Payment does not belong to this Razorpay order."

          });

      }


      /*
       * REQUIRED RAZORPAY SIGNATURE:
       *
       * order_id|payment_id
       */

      const payload =
        `${serverOrder.id}|${paymentId}`;


      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            RAZORPAY_KEY_SECRET
          )
          .update(
            payload
          )
          .digest(
            "hex"
          );


      const expectedBuffer =
        Buffer.from(
          expectedSignature,
          "utf8"
        );


      const receivedBuffer =
        Buffer.from(
          String(signature),
          "utf8"
        );


      const matches =
        expectedBuffer.length ===
          receivedBuffer.length &&

        crypto.timingSafeEqual(
          expectedBuffer,
          receivedBuffer
        );


      if (
        !matches
      ) {

        console.error(
          "❌ Razorpay signature mismatch."
        );


        return res
          .status(400)
          .json({

            ok:
              false,

            success:
              false,

            verified:
              false,

            error:
              "Payment signature verification failed."

          });

      }


      const captured =
        payment.status ===
        "captured";


      console.log(
        captured
          ? "✅ Razorpay payment captured."
          : `⚠️ Razorpay payment status: ${payment.status}`
      );


      res.json({

        ok:
          true,

        success:
          true,

        verified:
          true,

        captured,

        status:
          payment.status,

        razorpay_payment_id:
          paymentId,

        razorpay_order_id:
          serverOrder.id

      });


    } catch (
      error
    ) {

      console.error(
        "❌ RAZORPAY VERIFY PAYMENT ERROR:",
        error
      );


      res
        .status(400)
        .json({

          ok:
            false,

          success:
            false,

          verified:
            false,

          error:

            error?.error?.description ||

            error?.description ||

            error?.message ||

            "Payment verification failed."

        });

    }

  }
);


/* =========================================================
   RAZORPAY PUBLIC CONFIG
   Only the public Key ID is exposed.
========================================================= */

app.get(
  "/api/razorpay/config",
  (
    req,
    res
  ) => {

    if (
      !razorpayConfigured
    ) {

      return res
        .status(503)
        .json({

          ok:
            false,

          configured:
            false

        });

    }


    res.json({

      ok:
        true,

      configured:
        true,

      key_id:
        RAZORPAY_KEY_ID,

      mode:
        RAZORPAY_MODE

    });

  }
);


/* =========================================================
   404
========================================================= */

app.use(
  (
    req,
    res
  ) => {

    console.log(
      `❌ 404: ${req.method} ${req.path}`
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
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "❌ GLOBAL SERVER ERROR"
    );


    console.error(
      error
    );


    if (
      error?.code ===
      "LIMIT_FILE_SIZE"
    ) {

      return res
        .status(413)
        .json({

          ok:
            false,

          error:
            "Image is too large. Maximum allowed size is 20 MB."

        });

    }


    if (
      error?.message?.includes(
        "Only JPG"
      )
    ) {

      return res
        .status(400)
        .json({

          ok:
            false,

          error:
            error.message

        });

    }


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
      `💳 Razorpay configured: ${razorpayConfigured}`
    );

    console.log(
      `💳 Razorpay mode: ${RAZORPAY_MODE}`
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
