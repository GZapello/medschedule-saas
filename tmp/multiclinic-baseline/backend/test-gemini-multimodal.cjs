const { GoogleGenerativeAI } = require('@google/generative-ai');
const sharp = require('sharp');
const dotenv = require('dotenv');
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function testImage() {
  console.log('Generating test image with sharp...');
  const imgBuffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  }).jpeg().toBuffer();

  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.7-flash'
  ];

  for (const modelName of candidateModels) {
    try {
      console.log(`Testing model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const parts = [
        { text: 'Identifique a cor predominante da imagem em formato JSON: {"color":"nome"}' },
        { inlineData: { mimeType: 'image/jpeg', data: imgBuffer.toString('base64') } }
      ];

      const res = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json' }
      });
      console.log(`SUCCESS [${modelName}]:`, res.response.text());
      break;
    } catch (e) {
      console.log(`FAILED [${modelName}]:`, e.message);
    }
  }
}

testImage().catch(e => console.error('SCRIPT_ERROR:', e));
