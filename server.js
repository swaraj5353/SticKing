const express = require("express");
const multer = require("multer");
const path = require("path");
const OpenAI = require("openai");
const { toFile } = require("openai");

const app = express();

const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY is NOT configured.");
} else {
    console.log("✅ OPENAI_API_KEY is configured.");
}

const openai = OPENAI_API_KEY
    ? new OpenAI({
        apiKey: OPENAI_API_KEY
    })
    : null;


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({
    limit: "20mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "20mb"
}));


// =====================================================
// STATIC WEBSITE
// =====================================================

app.use(express.static(
    path.join(__dirname, "public")
));


// =====================================================
// MULTER
// =====================================================

const upload = multer({

    storage: multer.memoryStorage(),

    limits: {
        fileSize: 12 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        console.log("📁 FILE RECEIVED:");
        console.log("   Name:", file.originalname);
        console.log("   Type:", file.mimetype);

        if (
            !file.mimetype ||
            !file.mimetype.startsWith("image/")
        ) {

            return cb(
                new Error("Only image files are allowed.")
            );
        }

        cb(null, true);
    }
});


// =====================================================
// HEALTH
// =====================================================

app.get("/health", (req, res) => {

    res.json({
        ok: true,
        service: "SticKing AI Vehicle Customizer",
        status: "running",
        openaiConfigured: !!OPENAI_API_KEY
    });

});


// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );

});


// =====================================================
// GENERATE PREVIEW
//
// IMPORTANT:
// We support BOTH:
//
// /generate-preview
// /api/generate-preview
//
// and BOTH:
//
// vehicleImage
// vehiclePhoto
//
// =====================================================

const generatePreviewHandler = async (req, res) => {

    console.log("");
    console.log("==========================================");
    console.log("🚀 GENERATE PREVIEW REQUEST RECEIVED");
    console.log("==========================================");

    try {

        console.log("Request URL:", req.originalUrl);
        console.log("Request method:", req.method);


        // -------------------------------------------------
        // OPENAI KEY
        // -------------------------------------------------

        if (!openai) {

            console.error(
                "❌ OPENAI_API_KEY is missing."
            );

            return res.status(500).json({

                ok: false,
                success: false,

                error:
                    "OPENAI_API_KEY is not configured on the server."

            });

        }


        // -------------------------------------------------
        // IMAGE
        // -------------------------------------------------

        const file = req.file;

        if (!file) {

            console.error(
                "❌ NO IMAGE RECEIVED."
            );

            return res.status(400).json({

                ok: false,
                success: false,

                error:
                    "No vehicle image was uploaded."

            });

        }

        console.log("✅ IMAGE RECEIVED");

        console.log(
            "Filename:",
            file.originalname
        );

        console.log(
            "MIME:",
            file.mimetype
        );

        console.log(
            "Size:",
            file.size,
            "bytes"
        );


        // -------------------------------------------------
        // FORM VALUES
        // -------------------------------------------------

        const part =
            req.body.part ||
            "vehicle";

        const width =
            req.body.width ||
            req.body.widthCm ||
            "";

        const height =
            req.body.height ||
            req.body.heightCm ||
            "";

        const design =
            req.body.design ||
            req.body.description ||
            "custom vehicle decal";

        const extraInstructions =
            req.body.instructions ||
            req.body.additionalInstructions ||
            "";


        console.log("Vehicle part:", part);
        console.log("Width:", width);
        console.log("Height:", height);
        console.log("Design:", design);
        console.log(
            "Extra instructions:",
            extraInstructions
        );


        // -------------------------------------------------
        // PROMPT
        // -------------------------------------------------

        const prompt = `

Edit the uploaded vehicle photograph.

Create a highly realistic professional preview
of a vinyl sticker / decal applied to the vehicle.

Selected vehicle area:
${part}

Requested design:
${design}

Additional instructions:
${extraInstructions || "Make it premium, realistic and professionally fitted."}

Approximate physical size:
${width || "not specified"} cm wide
x
${height || "not specified"} cm high

IMPORTANT RULES:

- Keep the original vehicle.
- Do not replace the vehicle.
- Do not redesign the vehicle.
- Preserve the original vehicle shape.
- Preserve the original headlights.
- Preserve windows.
- Preserve wheels.
- Preserve body panels.
- Apply the decal naturally to the requested area.
- Follow the perspective and curvature of the vehicle.
- Make the decal look physically printed and professionally installed.
- Preserve realistic lighting.
- Preserve realistic reflections.
- Do not place the design outside the vehicle.
- Do not change the background unnecessarily.
- Make the final result photorealistic.
- The result should look like a real professional vehicle customization photograph.

`;


        console.log("");
        console.log("🧠 PROMPT:");
        console.log(prompt);


        // -------------------------------------------------
        // CONVERT IMAGE
        // -------------------------------------------------

        console.log(
            "🔄 Converting uploaded image..."
        );

        const imageFile = await toFile(

            file.buffer,

            file.originalname ||
            "vehicle.png",

            {
                type:
                    file.mimetype ||
                    "image/png"
            }

        );

        console.log(
            "✅ Image converted successfully."
        );


        // -------------------------------------------------
        // OPENAI REQUEST
        // -------------------------------------------------

        console.log("");
        console.log(
            "🎨 Sending image to OpenAI..."
        );

        console.log(
            "⏳ AI generation started..."
        );


        const result =
            await openai.images.edit({

                model: "gpt-image-1",

                image: imageFile,

                prompt: prompt,

                size: "1024x1024",

                n: 1

            });


        console.log(
            "✅ OpenAI response received."
        );


        // -------------------------------------------------
        // IMAGE RESULT
        // -------------------------------------------------

        const generated =
            result &&
            result.data &&
            result.data[0];


        if (!generated) {

            console.error(
                "❌ OpenAI returned no image object."
            );

            return res.status(500).json({

                ok: false,
                success: false,

                error:
                    "OpenAI returned no image."

            });

        }


        // -------------------------------------------------
        // BASE64
        // -------------------------------------------------

        if (generated.b64_json) {

            console.log(
                "✅ BASE64 IMAGE RECEIVED."
            );

            const image =
                "data:image/png;base64," +
                generated.b64_json;


            console.log(
                "🎉 Sending image back to browser."
            );


            return res.json({

                ok: true,

                success: true,

                image: image

            });

        }


        // -------------------------------------------------
        // URL FALLBACK
        // -------------------------------------------------

        if (generated.url) {

            console.log(
                "✅ IMAGE URL RECEIVED."
            );


            return res.json({

                ok: true,

                success: true,

                image: generated.url

            });

        }


        // -------------------------------------------------
        // UNKNOWN RESPONSE
        // -------------------------------------------------

        console.error(
            "❌ OpenAI returned an unexpected response."
        );

        return res.status(500).json({

            ok: false,

            success: false,

            error:
                "OpenAI returned an unexpected image response."

        });


    } catch (error) {

        console.error("");
        console.error(
            "=========================================="
        );

        console.error(
            "❌ GENERATE PREVIEW ERROR"
        );

        console.error(
            "=========================================="
        );

        console.error(
            "Message:",
            error.message
        );

        console.error(
            "Status:",
            error.status
        );

        console.error(
            "Code:",
            error.code
        );

        console.error(
            "Type:",
            error.type
        );

        console.error(
            "Full error:",
            error
        );


        return res.status(
            error.status || 500
        ).json({

            ok: false,

            success: false,

            error:
                error.message ||
                "Image generation failed."

        });

    }

};


// =====================================================
// BOTH ENDPOINTS
// =====================================================

app.post(

    "/generate-preview",

    upload.single("vehicleImage"),

    generatePreviewHandler

);


// Compatibility endpoint

app.post(

    "/api/generate-preview",

    upload.single("vehicleImage"),

    generatePreviewHandler

);


// Also accept the older field name

app.post(

    "/generate-preview",

    upload.single("vehiclePhoto"),

    generatePreviewHandler

);

app.post(

    "/api/generate-preview",

    upload.single("vehiclePhoto"),

    generatePreviewHandler

);


// =====================================================
// MULTER ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {

    console.error(
        "❌ SERVER / UPLOAD ERROR:"
    );

    console.error(error);


    if (
        error instanceof multer.MulterError
    ) {

        return res.status(400).json({

            ok: false,

            success: false,

            error:
                "Upload error: " +
                error.message

        });

    }


    return res.status(500).json({

        ok: false,

        success: false,

        error:
            error.message ||
            "Server error."

    });

});


// =====================================================
// 404
// =====================================================

app.use((req, res) => {

    console.error(
        "❌ ENDPOINT NOT FOUND:",
        req.method,
        req.originalUrl
    );

    res.status(404).json({

        ok: false,

        success: false,

        error:
            "Endpoint not found: " +
            req.originalUrl

    });

});


// =====================================================
// START
// =====================================================

app.listen(

    PORT,

    "0.0.0.0",

    () => {

        console.log("");
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
            !!OPENAI_API_KEY
        );

        console.log(
            "📡 Generate endpoint:"
        );

        console.log(
            "   POST /generate-preview"
        );

        console.log(
            "   POST /api/generate-preview"
        );

        console.log(
            "=========================================="
        );

    }

);
