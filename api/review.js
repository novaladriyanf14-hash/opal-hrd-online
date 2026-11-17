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

  const prompt = `Audit CV kandidat ini sebagai Senior HRD Indonesia secara singkat, tajam, dan padat.
Posisi: ${targetRole || 'Umum'} | Status: ${statusKandidat || 'Fresh Graduate'}
Teks CV:
"""
${cvText.slice(0, 8000)}
"""

Balas HANYA JSON valid dengan struktur persis berikut (setiap poin maksimal 1-2 kalimat singkat):
{
  "skorTotal": 76,
  "pilar": { "atsFormat": 80, "dampakAngka": 65, "relevansiSkill": 78, "strukturKejelasan": 82 },
  "level": "L3 · Siap Bersaing",
  "potensi": "L4 · Kandidat Kuat",
  "topPersen": "Top 20% kandidat",
  "ringkasanKesan": "Reaksi 3 detik pertama HRD.",
  "detik0_2": "Scan bagian atas/header CV.",
  "detik2_4": "Evaluasi pengalaman/projek.",
  "detik4_6": "Keputusan lanjut interview atau skip.",
  "daftarKesalahan": ["Kesalahan 1", "Kesalahan 2", "Kesalahan 3"],
  "missingKeywords": ["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4", "Keyword 5"],
  "rewrites": [
    { "sebelum": "Kutipan asli 1 dari CV", "sesudah": "Perbaikan dengan Action Verb + Angka" },
    { "sebelum": "Kutipan asli 2 dari CV", "sesudah": "Perbaikan kalimat 2" },
    { "sebelum": "Kutipan asli 3 dari CV", "sesudah": "Perbaikan kalimat 3" }
  ],
  "prediksiInterview": [
    { "pertanyaan": "Pertanyaan 1 dari isi CV", "tipsJawab": "Tips jawab singkat" },
    { "pertanyaan": "Pertanyaan 2", "tipsJawab": "Tips jawab singkat" },
    { "pertanyaan": "Pertanyaan 3", "tipsJawab": "Tips jawab singkat" }
  ]
}`;

  // Dahulukan model Lite yang paling cepat & bebas antrean
  const daftarModel = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash-lite'
  ];

  let lastError = 'Server AI sedang sibuk, silakan klik ulang tombol analisis.';

  for (const model of daftarModel) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500); // Batas tunggu maks 8.5 detik per model

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1500,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        lastError = data.error?.message || `Model ${model} sibuk`;
        continue;
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const hasilAnalisis = JSON.parse(rawText);

      return res.status(200).json(hasilAnalisis);
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err.name === 'AbortError' ? 'Koneksi AI terlalu lama, mencoba ulang...' : err.message;
      continue;
    }
  }

  return res.status(503).json({ error: lastError });
}
