const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const path = require("path");

const app = express();

const PORT =
  Number(process.env.PORT) || 10000;

const HOST = "0.0.0.0";

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

const DEFAULT_PRICE_INR =
  Number(
    process.env.STICKING_DEFAULT_PRICE_INR ||
    500
  );


/* =========================================================
   CONFIG STATUS
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
   OPENAI
========================================================= */

const openai =
  openaiConfigured
    ? new OpenAI({
        apiKey:
          OPENAI_API_KEY
      })
    : null;


/* =========================================================
   RAZORPAY
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
   SUPABASE
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
   LOG CONFIGURATION
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
   STATIC WEBSITE
========================================================= */

app.use(
  express.static(
    PUBLIC_DIR,
    {
      extensions: [
        "html"
      ],

      index:
        "index.html"
    }
  )
);


/* =========================================================
   CORS
========================================================= */

app.use(
  (
    req,
    res,
    next
  ) => {

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
  (
    req,
    res,
    next
  ) => {

    console.log(
      `➡️ ${req.method} ${req.path}`
    );

    next();

  }
);


/* =========================================================
   MULTER UPLOAD
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

  if (!value) {

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
   STORAGE UPLOAD
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


  const safeName =
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
    `${safeName}`;


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
   CREATE ORDER IN SUPABASE
========================================================= */

async function createSupabaseOrder(
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


/* =========================================================
   UPDATE ORDER
========================================================= */

async function updateSupabaseOrder(
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
  (
    req,
    res
  ) => {

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
  (
    req,
    res
  ) => {

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
  (
    req,
    res
  ) => {

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
  (
    req,
    res
  ) => {

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
  (
    req,
    res
  ) => {

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
  (
    req,
    res
  ) => {

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
  (
    req,
    res
  ) => {

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
        await updateSupabaseOrder(

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
        "❌ ORDER STATUS ERROR:",
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
   CREATE SUPABASE ORDER
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
        await createSupabaseOrder({

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
        "❌ CREATE SUPABASE ORDER ERROR:",
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
   GENERATE PREVIEW
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


      const extra =
        cleanText(
          req.body?.extra,
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


      /* -----------------------------------------------------
         STORAGE
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

        } catch (
          storageError
        ) {

          console.warn(
            "⚠️ Original image storage failed:",
            storageError.message
          );

        }

      }


      /* -----------------------------------------------------
         CREATE ORDER
      ----------------------------------------------------- */

      if (
        supabaseConfigured
      ) {

        try {

          const created =
            await createSupabaseOrder({

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
          orderError
        ) {

          console.warn(
            "⚠️ Could not create Supabase order:",
            orderError.message
          );

        }

      }


      /* -----------------------------------------------------
         PROMPT
      ----------------------------------------------------- */

      const prompt = [

        "You are a professional automotive vinyl decal designer.",

        "Edit the uploaded vehicle photograph to create a realistic preview of the requested sticker or decal.",

        "Preserve the original vehicle and keep it recognizable.",

        "Do not replace the vehicle.",

        "Do not redesign the vehicle.",

        "Preserve the vehicle body shape and proportions.",

        "Preserve camera angle and perspective.",

        "Preserve the environment as much as possible.",

        "Apply the artwork naturally to the requested vehicle panel.",

        "Respect doors, handles, body curves, fuel tanks, windows, fenders, bonnets and panel lines.",

        "Make the decal follow the vehicle's actual perspective and surface.",

        "Keep realistic lighting, shadows and reflections.",

        "Do not create a rectangular pasted image.",

        "Do not place the decal outside the vehicle.",

        "Do not add unrelated artwork.",

        "Make the result look like a professionally installed vinyl decal.",

        `Vehicle type: ${vehicleType || "not specified"}.`,

        `Vehicle make: ${make || "not specified"}.`,

        `Vehicle model: ${model || "not specified"}.`,

        `Vehicle year: ${year || "not specified"}.`,

        `Vehicle: ${vehicle || "not specified"}.`,

        `Requested panel: ${part || "not specified"}.`,

        `Sticker width: ${width || "not specified"} cm.`,

        `Sticker height: ${height || "not specified"} cm.`,

        `Requested design: ${design || description || "custom sticker"}.`,

        `Design description: ${description || "none"}.`,

        `Additional instructions: ${extra || "none"}.`

      ].join(" ");


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


      const result =
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
        !result?.data?.[0]?.b64_json
      ) {

        throw new Error(
          "OpenAI did not return an image."
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


      let generatedPath =
        null;


      if (
        supabaseConfigured
      ) {

        try {

          generatedPath =
            await uploadToStorage(

              generatedBuffer,

              "ai-preview.png",

              "image/png"

            );


          if (
            orderId
          ) {

            await updateSupabaseOrder(

              orderId,

              {

                generated_image_path:
                  generatedPath,

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

          await updateSupabaseOrder(

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
   REFINE PREVIEW
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
              "Previous preview could not be read."

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
              "Previous preview is too large."

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

        "Preserve the same vehicle.",

        "Preserve the vehicle model and body.",

        "Preserve camera perspective.",

        "Preserve the existing decal identity.",

        "Do not redesign unrelated parts.",

        `Requested change: ${refinement}.`

      ].join(" ");


      const result =
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


      const prompt = [

        "Create a standalone professional vehicle decal graphic.",

        `Design: ${description}.`,

        "Clean vinyl decal artwork.",

        "Bold shapes and clear outlines.",

        "Practical for sticker production.",

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
          `data:image/png;base64,${base64Image}`

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
   ADMIN PRINT PREP
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
        ) !== "false";


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
professional sticker print
preparation agent.

Prepare the uploaded artwork
for physical vinyl/sticker
production.

DO NOT redesign the artwork.

Preserve the original design.

Preserve proportions.

Preserve composition.

Preserve colours as closely as possible.

Preserve logos and text.

Remove unwanted background.

Remove excess surrounding material.

Remove obvious dust.

Reduce noise and compression artifacts.

Clean rough edges.

Reduce jagged edges.

Make the artwork crisp.

Do not invent new artwork.

Do not add decorative elements.

Do not crop actual artwork.

Do not distort the artwork.

${
  removeBackground
    ? "Return the final artwork with a fully transparent background."
    : "Keep the original background."
}

The result must remain faithful
to the uploaded artwork.

`;


      const result =
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
        !result?.data?.[0]?.b64_json
      ) {

        throw new Error(
          "OpenAI did not return a PNG."
        );

      }


      const base64Image =
        result
          .data[0]
          .b64_json;


      res.json({

        ok:
          true,

        image:
          `data:image/png;base64,${base64Image}`,

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
       * Amount is sent in paise.
       *
       * ₹1 = 100 paise.
       */

      if (
        !Number.isInteger(
          amountPaise
        ) ||
        amountPaise <
          100
      ) {

        /*
         * Only use fallback when amount
         * wasn't supplied at all.
         */

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
              DEFAULT_PRICE_INR *
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


      const options = {

        amount:
          amountPaise,

        currency:
          "INR",

        receipt:

          receipt

      };


      console.log(
        "💳 Creating Razorpay order..."
      );


      const order =
        await razorpay.orders.create(
          options
        );


      console.log(
        "✅ Razorpay order created:",
        order.id
      );


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
       * Fetch the order from Razorpay.
       */

      const order =
        await razorpay.orders.fetch(
          orderId
        );


      if (
        !order ||
        !order.id
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
        !payment ||
        payment.order_id !==
          order.id
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
       * REQUIRED SIGNATURE:
       *
       * order_id + "|" + payment_id
       */

      const payload =
        `${order.id}|${paymentId}`;


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
        `✅ Razorpay payment verified: ${paymentId}`
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
          order.id

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
   RAZORPAY CONFIG
   PUBLIC KEY ONLY
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
            "Image is too large. Maximum size is 20 MB."

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
