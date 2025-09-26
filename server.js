// server.js - Version 4.1 - Korrekt fil-inläsning
// Denna server är "hjärnan" i vårt projekt. Den läser in alla separata JSON-filer
// från 'knowledge'-mappen för att bygga en komplett databas i minnet.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path'); // Används för att hantera filsökvägar korrekt
const Fuse = require('fuse.js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- DATABAS & SÖK-INSTÄLLNINGAR ---

let knowledge = {
  base_facts: {},
  offices: []
};
let officeSearcher;

// Funktion för att ladda in VÅR NYA, UPPDELADE kunskapsdatabas
function loadKnowledge() {
  const knowledgePath = path.join(__dirname, 'knowledge');
  
  try {
    const files = fs.readdirSync(knowledgePath);
    console.log(`[Server] Hittade ${files.length} filer i knowledge-mappen.`);

    knowledge.base_facts = {};
    knowledge.offices = [];

    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(knowledgePath, file);
        const rawData = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(rawData);

        // --- KORRIGERAD LOGIK HÄR ---
        // Om filnamnet börjar med 'basfakta_', lägg till i base_facts.
        // Annars, anta att det är en kontors-fil.
        if (file.startsWith('basfakta_')) {
          knowledge.base_facts = { ...knowledge.base_facts, ...jsonData };
        } else {
          knowledge.offices.push(jsonData);
        }
      }
    });

    console.log(`[Server] Laddat in ${Object.keys(knowledge.base_facts).length} basfakta-sektioner.`);
    console.log(`[Server] Laddat in ${knowledge.offices.length} kontor.`);

    const options = {
      keys: ['name', 'city'],
      includeScore: true,
      threshold: 0.4,
    };
    officeSearcher = new Fuse(knowledge.offices, options);
    console.log(`[Server] Sökmotor för ${knowledge.offices.length} kontor är redo.`);

  } catch (error) {
    console.error('[Server] Ett allvarligt fel inträffade vid inläsning av knowledge-filer:', error);
  }
}

// --- HJÄLPROUTINER (VERKTYG) ---

function findServiceKeywords(question) {
    const q = question.toLowerCase();
    const foundServices = [];
    const serviceMap = {
        'körlektion': ['lektion', 'körlektion'],
        'riskettan': ['risk1', 'riskettan', 'risk 1'],
        'risktvåan': ['risk2', 'risktvåan', 'halkbana', 'risk 2'],
        'handledarkurs': ['handledar', 'introduktionskurs'],
        'am-kurs': ['am', 'moped', 'moppe'],
        'mc-lektion': ['mc-lektion', 'mc lektion', 'motorcykel'],
        'b96': ['b96', 'utökat b'],
        'be': ['be', 'tungt släp'],
    };

    for (const service in serviceMap) {
        for (const keyword of serviceMap[service]) {
            if (q.includes(keyword)) {
                foundServices.push(service);
                break;
            }
        }
    }
    return foundServices;
}

// --- HUVUDLOGIK (API ENDPOINT) ---

app.post('/ask', (req, res) => {
  const question = req.body.question || "";
  console.log(`[Server] Mottog fråga: "${question}"`);

  if (!question) {
    return res.status(400).json({ answer: "Frågan var tom." });
  }

  const officeResults = officeSearcher.search(question);
  const bestOffice = officeResults.length > 0 ? officeResults[0].item : null;
  const services = findServiceKeywords(question);

  if (bestOffice && services.length > 0) {
    const serviceNameQuery = services[0];
    let priceInfo = "Jag hittade tyvärr inget specifikt pris för den tjänsten på det kontoret.";
    const priceEntry = bestOffice.prices.find(p => p.service_name.toLowerCase().includes(serviceNameQuery.replace('-', ' ')));
    
    if (priceEntry) {
      priceInfo = `Priset för ${priceEntry.service_name} på vårt kontor i ${bestOffice.city} är ${priceEntry.price} kr.`;
    }
    
    const finalAnswer = `${priceInfo}\n\n${bestOffice.description}\n\nDu kan kontakta dem på ${bestOffice.contact.phone}.`;
    return res.json({ answer: finalAnswer });

  } else if (services.length > 0) {
    return res.json({ answer: `Absolut! För vilken stad vill du veta priset?` });
  
  } else if (bestOffice) {
    const openingHours = bestOffice.opening_hours.map(oh => `${oh.days}: ${oh.hours}`).join('\n');
    const answer = `Hej! Här är informationen för vårt kontor i ${bestOffice.city}:\n\n${bestOffice.description}\n\nÖppettider:\n${openingHours}\n\nDu når dem på ${bestOffice.contact.phone}. Vad kan jag hjälpa dig med gällande detta kontor?`;
    return res.json({ answer });
  
  } else {
    return res.json({ answer: "Jag är inte säker på att jag förstår. Kan du försöka omformulera frågan? Jag kan bäst svara på frågor om priser, tjänster och specifika kontor." });
  }
});

// Starta servern
app.listen(PORT, () => {
  console.log(`[Server] Lyssnar på http://localhost:${PORT}`);
  loadKnowledge();
});