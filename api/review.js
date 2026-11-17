export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode tidak diizinkan' });
  }

  const { cvText, targetRole, statusKandidat } = req.body;

  if (!cvText || cvText.trim().length < 50) {
    return res.status(400).json({ error: 'Teks CV terlalu pendek untuk dianalisis (minimal 50 karakter).' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key Gemini belum diatur di server.' });
  }

  const prompt = `Kamu adalah Senior HRD Indonesia. Audit CV ini dengan bahasa lugas, padat, dan langsung ke inti.
Posisi: ${targetRole || 'Umum'} | Status: ${statusKandidat || 'Fresh Graduate'}
CV:
"""
${cvText.slice(0, 7000)}
"""

Keluarkan HANYA JSON valid (tanpa teks lain) sesuai struktur ini:
{
  "skorTotal": 76,
  "pilar": { "atsFormat": 80, "dampakAngka": 65, "relevansiSkill": 78, "strukturKejelasan": 82 },
  "level": "L3 · Siap Bersaing",
  "potensi": "L4 · Kandidat Kuat",
  "topPersen": "Top 20% kandidat",
  "ringkasanKesan": "1 kalimat kesan pertama HRD.",
  "detik0_2": "Scan header & ringkasan CV (1 kalimat).",
  "detik2_4": "Evaluasi pengalaman & skill (1 kalimat).",
  "detik4_6": "Keputusan lanjut interview atau skip (1 kalimat).",
  "daftarKesalahan": ["Kesalahan spesifik 1", "Kesalahan spesifik 2", "Kesalahan spesifik 3"],
  "missingKeywords": ["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4", "Keyword 5"],
  "rewrites": [
    { "sebelum": "Kutipan kalimat lemah 1 dari CV", "sesudah": "Perbaikan dengan Action Verb + Angka" },
    { "sebelum": "Kutipan kalimat lemah 2 dari CV", "sesudah": "Perbaikan kalimat 2" },
    { "sebelum": "Kutipan kalimat lemah 3 dari CV", "sesudah": "Perbaikan kalimat 3" }
  ],
  "prediksiInterview": [
    { "pertanyaan": "Pertanyaan interview 1 dari CV", "tipsJawab": "Tips jawab singkat" },
    { "pertanyaan": "Pertanyaan interview 2", "tipsJawab": "Tips jawab singkat" },
    { "pertanyaan": "Pertanyaan interview 3", "tipsJawab": "Tips jawab singkat" }
  ]
}`;

  const daftarModel = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash'
  ];

  let lastError = 'Server AI sedang sibuk, silakan coba klik ulang.';

  for (const model of daftarModel) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2500,
              responseMimeType: 'application/json',
              thinkingConfig: {
                thinkingBudget: 0
              }
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError = data.error?.message || `Model ${model} sibuk`;
        continue;
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const hasilAnalisis = JSON.parse(rawText);

      return res.status(200).json(hasilAnalisis);
    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  return res.status(503).json({ error: lastError });
}
