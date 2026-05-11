const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const Message = require("./models/Message");

const app = express();
app.use(cors());
app.use(express.json());

/* 🔗 MONGODB CONNECTION */
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://youaloneboy704_db_user:DADSON55@cluster0.geubidg.mongodb.net/basebot_db?retryWrites=true&w=majority&appName=Cluster0", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("🔥 MongoDB connected"))
  .catch(err => console.log(err));

/* 📧 EMAIL CONFIG */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kaviduinduwara2008@gmail.com",
    pass: "Cluster0"
  }
});

/* 📩 SEND MESSAGE API */
app.post("/send-message", async (req, res) => {
  const { name, message } = req.body;

  if (!message) return res.status(400).json({ error: "Message required" });

  try {

    /* 💾 SAVE TO MONGODB */
    const newMsg = new Message({ name, message });
    await newMsg.save();

    const text = `Nom: ${name || "Anonyme"}\nMessage: ${message}`;

    /* 📧 EMAIL */
    await transporter.sendMail({
      from: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",
      to: "youtechxofc@gmail.com",
      subject: "ɴᴇᴡ ᴍᴇssᴀɢᴇ ʏᴏᴜ ʙᴏᴛ",
      text: text
    });

    /* 💬 WHATSAPP LINK */
    const whatsapp = `https://wa.me/50941319791?text=${encodeURIComponent(text)}`;

    res.json({
      success: true,
      whatsapp,
      saved: true
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 📊 GET ALL MESSAGES (ADMIN PANEL FUTURE) */
app.get("/messages", async (req, res) => {
  const msgs = await Message.find().sort({ date: -1 });
  res.json(msgs);
});

/* START */
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
