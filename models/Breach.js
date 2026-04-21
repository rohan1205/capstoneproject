const mongoose = require("mongoose");

const BreachSchema = new mongoose.Schema({

industry: {
type: String,
required: true
},

recordsAffected: {
type: Number,
required: true
},

attackVector: {
type: String,
default: ""
},

detectionTime: {
type: Number,
default: 0
},

severity: {
type: String
},

riskScore: {
type: Number
},

financialImpact: {
type: Number
},
analysisInput: {
industry: { type: String, default: "" },
attackVector: { type: String, default: "" },
detectionTime: { type: Number, default: 0 },
recordsAffected: { type: Number, required: true }
},
modelVersion: {
type: String,
default: "v1"
},
confidence: {
type: Number,
min: 0,
max: 1
},
analysisNotes: {
type: String,
default: ""
},

user: {
type: mongoose.Schema.Types.ObjectId,
ref: "User",
required: true,
index: true
}

}, { timestamps: true });

module.exports = mongoose.model("Breach", BreachSchema);
