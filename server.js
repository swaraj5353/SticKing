const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");

const app = express();

const PORT = process.env.PORT || 10000;


/* =========================================================
   CONFIGURATION
   ========================================================= */

const openaiConfigured = !!process.env.OPENAI_API_KEY;

const supabaseUrl =
  process.env.SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY;

const adminPassword =
  process.env.ADMIN_PASSWORD;


/* =========================================================
   OPENAI
   ========================================================= */

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
   SUPABASE CONFIGURATION
   ========================================================= */

if (supabaseUrl) {
  console.log("✅ SUPABASE_URL is configured.");
} else {
  console.log("❌ SUPABASE_URL is NOT configured.");
}

if (supabaseSecretKey) {
  console.log("✅ SUPABASE_SECRET_KEY is configured.");
} else {
  console.log("❌ SUPABASE_SECRET_KEY is NOT configured.");
}

if (adminPassword) {
  console.log("✅ ADMIN_PASSWORD is configured.");
} else {
  console.log("⚠️ ADMIN_PASSWORD is NOT configured.");
}


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
    "GET, POST, OPTIONS"
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
    console.log("➡️ OPTIONS", req.path);
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
   HEALTH CHECK
   ========================================================= */

app.get("/health", (req, res) => {

  res.json({

    ok: true,

    service:
      "SticKing AI Vehicle Customizer",

    status:
      "running",

    openaiConfigured:
      openaiConfigured,

    databaseConfigured:
      !!(
        supabaseUrl &&
        supabaseSecretKey
      )

  });

});


/* =========================================================
   HOME
   ========================================================= */

app.get("/", (req, res) => {

  res.sendFile(
    __dirname +
    "/public/index.html"
  );

});


/* =========================================================
   ADMIN PAGE
   ========================================================= */

app.get("/admin", (req, res) => {

  res.sendFile(
    __dirname +
    "/public/admin.html"
  );

});


app.get("/admin.html", (req, res) => {

  res.sendFile(
    __dirname +
    "/public/admin.html"
  );

});


/* =========================================================
   ADMIN LOGIN
   ========================================================= */

app.post(
  "/api/admin/login",
  (req, res) => {

    console.log(
      "🔐 ADMIN LOGIN REQUEST"
    );

    if (!adminPassword) {

      console.log(
        "❌ ADMIN_PASSWORD is missing."
      );

      return res.status(500).json({

        ok: false,

        error:
          "ADMIN_PASSWORD is not configured on the server."

      });

    }


    const password =
      req.body?.password;


    if (
      !password ||
      password !== adminPassword
    ) {

      console.log(
        "❌ Admin login failed."
      );

      return res.status(401).json({

        ok: false,

        error:
          "Invalid admin password."

      });

    }


    console.log(
      "✅ Admin login successful."
    );


    return res.json({

      ok: true

    });

  }
);


/* =========================================================
   ADMIN — GET ORDERS
   ========================================================= */

app.get(
  "/api/admin/orders",
  async (req, res) => {

    console.log(
      "📦 ADMIN ORDERS REQUEST"
    );


    try {

      /* -----------------------------------------------------
         CHECK ADMIN PASSWORD
         ----------------------------------------------------- */

      if (!adminPassword) {

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
        password !== adminPassword
      ) {

        console.log(
          "❌ Unauthorized admin request."
        );

        return res.status(401).json({

          ok: false,

          error:
            "Unauthorized."

        });

      }


      /* -----------------------------------------------------
         CHECK SUPABASE
         ----------------------------------------------------- */

      if (
        !supabaseUrl ||
        !supabaseSecretKey
      ) {

        console.log(
          "❌ Supabase configuration missing."
        );

        return res.status(500).json({

          ok: false,

          error:
            "Supabase configuration is missing."

        });

      }


      /* -----------------------------------------------------
         GET ORDERS FROM SUPABASE
         ----------------------------------------------------- */

      const url =
        `${supabaseUrl}/rest/v1/orders` +
        `?select=*` +
        `&order=created_at.desc`;


      console.log(
        "🔎 Requesting orders from Supabase..."
      );


      const response =
        await fetch(url, {

          method:
            "GET",

          headers: {

            "apikey":
              supabaseSecretKey,

            "Authorization":
              `Bearer ${supabaseSecretKey}`,

            "Content-Type":
              "application/json"

          }

        });


      const text =
        await response.text();


      /* -----------------------------------------------------
         SUPABASE ERROR
         ----------------------------------------------------- */

      if (!response.ok) {

        console.error(
          "❌ SUPABASE ORDERS ERROR"
        );

        console.error(
          "Status:",
          response.status
        );

        console.error(
          "Response:",
          text
        );


        return res.status(500).json({

          ok: false,

          error:
            "Could not retrieve orders from Supabase.",

          details:
            text

        });

      }


      /* -----------------------------------------------------
         PARSE ORDERS
         ----------------------------------------------------- */

      let orders;

      try {

        orders =
          JSON.parse(text);

      } catch (parseError) {

        console.error(
          "❌ Could not parse Supabase response."
        );

        return res.status(500).json({

          ok: false,

          error:
            "Invalid response from Supabase."

        });

      }


      console.log(
        `✅ ${orders.length} orders received.`
      );


      return res.json({

        ok: true,

        orders:
          orders

      });

    } catch (error) {

      console.error(
        "=========================================="
      );

      console.error(
        "❌ ADMIN ORDERS FAILED"
      );

      console.error(
        "=========================================="
      );

      console.error(
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          error.message ||
          "Failed to load orders."

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


    try {

      /* -----------------------------------------------------
         CHECK OPENAI
         ----------------------------------------------------- */

      if (
        !openaiConfigured ||
        !openai
      ) {

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

      const design =
        req.body.design ||
        "";

      const width =
        req.body.width ||
        "";

      const height =
        req.body.height ||
        "";

      const description =
        req.body.description ||
        "";


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
- Do not alter the vehicle's basic identity.
- Make the result look like a real photograph.

Sticker/design:
${design}

Requested dimensions:
Width: ${width} cm
Height: ${height} cm

Additional customer instructions:
${description}

Generate a high-quality realistic vehicle customization preview.

`;


      console.log(
        "🧠 Prompt created."
      );


      /* -----------------------------------------------------
         CONVERT UPLOAD TO PROPER FILE
         ----------------------------------------------------- */

      console.log(
        "📦 Converting uploaded image to OpenAI file..."
      );


      const imageFile =
        await toFile(
          req.file.buffer,
          req.file.originalname,
          {
            type:
              req.file.mimetype
          }
        );


      console.log(
        "✅ Image converted successfully."
      );


      /* -----------------------------------------------------
         OPENAI IMAGE GENERATION
         ----------------------------------------------------- */

      console.log(
        "🤖 Sending image to OpenAI..."
      );


      const imageResponse =
        await openai.images.edit({

          model:
            "gpt-image-1",

          image:
            imageFile,

          prompt:
            prompt,

          size:
            "1024x1024"

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
         BASE64 IMAGE
         ----------------------------------------------------- */

      if (result.b64_json) {

        console.log(
          "🖼️ Base64 image received."
        );


        return res.json({

          ok: true,

          image:
            `data:image/png;base64,${result.b64_json}`

        });

      }


      /* -----------------------------------------------------
         URL IMAGE
         ----------------------------------------------------- */

      if (result.url) {

        console.log(
          "🔗 Image URL received."
        );


        return res.json({

          ok: true,

          image:
            result.url

        });

      }


      /* -----------------------------------------------------
         UNKNOWN RESPONSE
         ----------------------------------------------------- */

      console.log(
        "❌ OpenAI response did not contain an image."
      );


      return res.status(500).json({

        ok: false,

        error:
          "Unexpected OpenAI image response."

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


      if (error.response) {

        console.error(
          "OpenAI response:",
          error.response
        );

      }


      console.error(
        error
      );


      /* -----------------------------------------------------
         RETURN USEFUL ERROR TO WEBSITE
         ----------------------------------------------------- */

      let message =
        error.message ||
        "Image generation failed.";


      if (error.status === 429) {

        message =
          "OpenAI API quota or credits are unavailable. Please check your OpenAI API billing and usage.";

      }


      return res.status(
        error.status >= 400 &&
        error.status < 600
          ? error.status
          : 500
      ).json({

        ok: false,

        error:
          message

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
   START SERVER
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
      `🌐 http://0.0.0.0:${PORT}`
    );

    console.log(
      `🔑 OpenAI configured: ${openaiConfigured}`
    );

    console.log(
      `🗄️ Supabase configured: ${
        !!(
          supabaseUrl &&
          supabaseSecretKey
        )
      }`
    );

    console.log(
      `👑 Admin configured: ${
        !!adminPassword
      }`
    );

    console.log(
      "=========================================="
    );

  }
);
