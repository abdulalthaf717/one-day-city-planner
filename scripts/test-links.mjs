/**
 * Standalone Node CLI test script for Official Websites and Verified Ticket-Booking Links.
 *
 * Verifies Requirements 1-10:
 * Test A: Website metadata propagation
 * Test B: Verified booking link
 * Test C: Website without booking URL
 * Test D: Missing links (graceful normal operation)
 * Test E: Unverified booking link
 * Test F: Invalid URL rejection (dangerous schemes & malformed URLs)
 * Test G: Link provenance distinction
 * Test H: Attraction identity protection (no accidental inheritance by similar names)
 * Test I: Copilot response grounded in link metadata
 * Test J: No invented links (zero fabrication)
 * Test K: Existing planning behavior invariance
 * Test L: Tourist Place Quality Gate preservation
 *
 * Usage: node scripts/test-links.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAndSanitizeUrl, sanitizeExternalUrl, isSafeExternalUrl } from '../src/utils/urlSecurity.ts';
import {
  lookupVerifiedAttractionLinks,
  resolveAttractionActionLinks,
  VERIFIED_ATTRACTION_REGISTRY,
} from '../src/services/places/verifiedBookingRegistry.ts';
import { evaluateTouristQualityGate } from '../src/services/geoapify/touristQualityGate.ts';
import { generatePlanOrEvaluativeReply } from '../src/copilot/conversationalResponder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Read .env.local if present
const envLocalPath = path.join(rootDir, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim();
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

console.log('================================================================');
console.log('OFFICIAL WEBSITES & TICKET-BOOKING LINKS TEST SUITE');
console.log('TESTS A - L (Complete Verification of Requirements 1 - 10)');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function report(id, name, passed, details) {
  if (passed) {
    passCount++;
    console.log(`[PASS] ${id}: ${name}`);
  } else {
    failCount++;
    console.log(`[FAIL] ${id}: ${name}`);
  }
  if (details) {
    console.log(`       Details: ${details}\n`);
  }
}

// -----------------------------------------------------------------
// TEST A: Website Metadata Propagation
// -----------------------------------------------------------------
try {
  const providerWeb = 'https://www.hehnmh.com/visiting-info';
  const linksA = resolveAttractionActionLinks({
    placeId: '5109e9dfe4ed9e534059dd990986735d3140f00103f90162b15d2500000000920312546865204e697a616d2773204d757365756d',
    name: "The Nizam's Museum",
    coordinates: { lat: 17.3664, lng: 78.4828 },
    providerWebsite: providerWeb,
  });

  const passedA =
    Boolean(linksA.websiteUrl) &&
    linksA.websiteUrl.includes('hehnmh.com') &&
    linksA.websiteLabel === 'Website' &&
    linksA.directionsUrl.includes('17.3664');

  report(
    'TEST A',
    'Website Metadata Propagation (Provider website survives normalization & link resolution)',
    passedA,
    `Resolved website: ${linksA.websiteUrl}, Label: "${linksA.websiteLabel}", Source: "${linksA.websiteSource}".`
  );
} catch (err) {
  report('TEST A', 'Website Metadata Propagation', false, err.message);
}

// -----------------------------------------------------------------
// TEST B: Verified Booking Link (Case A)
// -----------------------------------------------------------------
try {
  const linksB = resolveAttractionActionLinks({
    name: 'Nehru Zoological Park',
    coordinates: { lat: 17.3508, lng: 78.4516 },
  });

  const passedB =
    linksB.officialBookingUrl === 'https://nzptsfd.telangana.gov.in/' &&
    linksB.bookingVerificationStatus === 'verified' &&
    linksB.bookingLabel === 'Book Official Tickets' &&
    Boolean(linksB.bookingVerificationSource);

  report(
    'TEST B',
    'Verified Booking Link (Attraction with curated registry entry displays Book Official Tickets)',
    passedB,
    `Booking URL: ${linksB.officialBookingUrl}, Status: "${linksB.bookingVerificationStatus}", Label: "${linksB.bookingLabel}", Provenance: "${linksB.bookingVerificationSource}".`
  );
} catch (err) {
  report('TEST B', 'Verified Booking Link', false, err.message);
}

// -----------------------------------------------------------------
// TEST C: Website Available Without Booking URL (Case B)
// -----------------------------------------------------------------
try {
  const linksC = resolveAttractionActionLinks({
    name: 'Salar Jung Museum',
    coordinates: { lat: 17.3713, lng: 78.4804 },
  });

  const passedC =
    Boolean(linksC.websiteUrl) &&
    linksC.websiteUrl === 'https://salarjungmuseum.in/' &&
    linksC.officialBookingUrl === undefined &&
    linksC.bookingLabel === undefined &&
    linksC.websiteLabel === 'Website';

  report(
    'TEST C',
    'Website Without Booking URL (General website displayed without mislabelling as booking page)',
    passedC,
    `Website: ${linksC.websiteUrl}, BookingURL: ${linksC.officialBookingUrl}, BookingLabel: ${linksC.bookingLabel}.`
  );
} catch (err) {
  report('TEST C', 'Website Without Booking URL', false, err.message);
}

// -----------------------------------------------------------------
// TEST D: Missing Links (Case C)
// -----------------------------------------------------------------
try {
  const linksD = resolveAttractionActionLinks({
    name: 'Telangana State Archaeology Museum',
    coordinates: { lat: 17.3995, lng: 78.4697 },
  });

  const passedD =
    linksD.websiteUrl === undefined &&
    linksD.officialBookingUrl === undefined &&
    linksD.bookingLabel === undefined &&
    Boolean(linksD.directionsUrl);

  report(
    'TEST D',
    'Missing Links (Attraction without website or booking link functions safely with directions link)',
    passedD,
    `Website: ${linksD.websiteUrl}, Booking: ${linksD.officialBookingUrl}, Directions: "${linksD.directionsUrl}".`
  );
} catch (err) {
  report('TEST D', 'Missing Links', false, err.message);
}

// -----------------------------------------------------------------
// TEST E: Unverified Booking Link (Case D)
// -----------------------------------------------------------------
try {
  // An arbitrary third-party website or blog should NOT be labelled as verified official booking
  const linksE = resolveAttractionActionLinks({
    name: 'Random Sight Seeing Spot',
    providerWebsite: 'https://www.travelblog-example.com/tickets-info',
  });

  const passedE =
    linksE.bookingVerificationStatus === 'unavailable' &&
    linksE.officialBookingUrl === undefined &&
    linksE.bookingLabel === undefined &&
    linksE.websiteLabel === 'Website';

  report(
    'TEST E',
    'Unverified Booking Link (Arbitrary provider URLs not promoted to official booking)',
    passedE,
    `BookingVerification: "${linksE.bookingVerificationStatus}", BookingLabel: ${linksE.bookingLabel}, WebsiteLabel: "${linksE.websiteLabel}".`
  );
} catch (err) {
  report('TEST E', 'Unverified Booking Link', false, err.message);
}

// -----------------------------------------------------------------
// TEST F: URL Security & Scheme Rejection
// -----------------------------------------------------------------
try {
  const dangerousSchemes = [
    'javascript:alert("XSS")',
    'data:text/html,<script>alert(1)</script>',
    'file:///C:/Windows/System32/drivers/etc/hosts',
    'vbscript:MsgBox(1)',
  ];

  const allRejected = dangerousSchemes.every((u) => !isSafeExternalUrl(u));

  const credentialUrl = 'https://admin:supersecret@example.com/tickets';
  const credentialCheck = validateAndSanitizeUrl(credentialUrl);

  const sensitiveParamUrl = 'https://api.example.com/booking?apiKey=MY_SECRET_KEY&id=123';
  const paramSanitized = sanitizeExternalUrl(sensitiveParamUrl);
  const paramStripped = paramSanitized && !paramSanitized.includes('apiKey');

  const validUrl = 'https://nzptsfd.telangana.gov.in/';
  const validCheck = validateAndSanitizeUrl(validUrl);

  const passedF = allRejected && !credentialCheck.isSafe && paramStripped && validCheck.isSafe;

  report(
    'TEST F',
    'Invalid URL Rejection (Rejects dangerous schemes, embedded credentials, and strips API keys)',
    passedF,
    `DangerousSchemesBlocked: ${allRejected}, CredentialsBlocked: ${!credentialCheck.isSafe}, SensitiveParamStripped: ${paramStripped}, ValidUrlAccepted: ${validCheck.isSafe}.`
  );
} catch (err) {
  report('TEST F', 'Invalid URL Rejection', false, err.message);
}

// -----------------------------------------------------------------
// TEST G: Link Provenance Distinction
// -----------------------------------------------------------------
try {
  const officialEntry = VERIFIED_ATTRACTION_REGISTRY.find(
    (e) => e.attractionId === 'nehru-zoological-park-hyderabad'
  );
  const providerLinks = resolveAttractionActionLinks({
    name: 'Local City Landmark',
    providerWebsite: 'https://local-landmark.org/visit',
  });

  const passedG =
    officialEntry?.bookingVerificationSource?.includes('Telangana State Forest Department') &&
    officialEntry.bookingVerificationDate === '2026-10-27' &&
    providerLinks.websiteSource === 'provider';

  report(
    'TEST G',
    'Link Provenance Distinction (Distinguishes curated verified provenance from provider sources)',
    passedG,
    `OfficialSource: "${officialEntry?.bookingVerificationSource}", Date: "${officialEntry?.bookingVerificationDate}", ProviderSource: "${providerLinks.websiteSource}".`
  );
} catch (err) {
  report('TEST G', 'Link Provenance Distinction', false, err.message);
}

// -----------------------------------------------------------------
// TEST H: Attraction Identity Protection (No Accidental Inheritance)
// -----------------------------------------------------------------
try {
  // A place with a similar name "Nehru Centenary Tribal Museum" or "Nehru Park"
  // must NOT inherit Nehru Zoological Park's booking link!
  const tribalMuseumLinks = resolveAttractionActionLinks({
    name: 'Nehru Centenary Tribal Museum',
    coordinates: { lat: 17.4011, lng: 78.4901 },
  });

  const farNehruZooLinks = resolveAttractionActionLinks({
    name: 'Nehru Zoo Delhi',
    coordinates: { lat: 28.6041, lng: 77.2458 }, // Delhi coordinates
  });

  const passedH =
    tribalMuseumLinks.officialBookingUrl === undefined &&
    tribalMuseumLinks.bookingLabel === undefined &&
    farNehruZooLinks.officialBookingUrl === undefined;

  report(
    'TEST H',
    'Attraction Identity Protection (Similar-named places do NOT accidentally inherit verified links)',
    passedH,
    `Tribal Museum Booking: ${tribalMuseumLinks.officialBookingUrl}, Far-away Zoo Booking: ${farNehruZooLinks.officialBookingUrl}.`
  );
} catch (err) {
  report('TEST H', 'Attraction Identity Protection', false, err.message);
}

// -----------------------------------------------------------------
// TEST I: Copilot Response Grounded in Link Metadata
// -----------------------------------------------------------------
try {
  const dummyContext = {
    city: 'Hyderabad',
    startPoint: { name: 'VNR VJIET' },
    endPoint: { name: 'Secunderabad Railway Station' },
    timeWindow: { startTime: '09:30', latestArrivalTime: '18:00' },
    travelMode: 'drive',
    numberOfPeople: 2,
    interests: ['History'],
    currentStops: [],
    totalTravelMinutes: 60,
    totalActivityMinutes: 180,
    safetyBufferMinutes: 25,
    unusedAvailableMinutes: 120,
    plannedArrivalTime: '16:00',
    deadlineArrivalTime: '18:00',
    availableCandidateSample: [],
    canUndo: false,
    hasItinerary: true,
    planningWindowMinutes: 510,
  };

  // Case A inquiry: Nehru Zoo
  const replyA = generatePlanOrEvaluativeReply({
    rawQuestion: 'Can I book tickets for Nehru Zoo?',
    decision: { actionType: 'INFORMATIONAL_QUESTION', isSimulation: false, isQuestionOnly: true, requiresClarification: false, parameters: { isBookingInquiry: true, targetPlace: 'Nehru Zoological Park' }, reasoning: 'test' },
    context: dummyContext,
    preferences: { interests: ['Nature'] },
  });

  // Case B inquiry: Salar Jung Museum
  const replyB = generatePlanOrEvaluativeReply({
    rawQuestion: 'Where can I book tickets for Salar Jung Museum?',
    decision: { actionType: 'INFORMATIONAL_QUESTION', isSimulation: false, isQuestionOnly: true, requiresClarification: false, parameters: { isBookingInquiry: true, targetPlace: 'Salar Jung Museum' }, reasoning: 'test' },
    context: dummyContext,
    preferences: { interests: ['History'] },
  });

  // Case C inquiry: Telangana State Archaeology Museum
  const replyC = generatePlanOrEvaluativeReply({
    rawQuestion: 'Can I buy online tickets for Telangana State Archaeology Museum?',
    decision: { actionType: 'INFORMATIONAL_QUESTION', isSimulation: false, isQuestionOnly: true, requiresClarification: false, parameters: { isBookingInquiry: true, targetPlace: 'Telangana State Archaeology Museum' }, reasoning: 'test' },
    context: dummyContext,
    preferences: { interests: ['History'] },
  });

  const passedI =
    replyA.reply.includes('Book Official Tickets') &&
    replyA.reply.includes('nzptsfd.telangana.gov.in') &&
    replyB.reply.includes('salarjungmuseum.in') &&
    replyB.reply.includes('ticket counter') &&
    replyC.reply.includes('on-site ticket counter');

  report(
    'TEST I',
    'Copilot Response Grounded in Link Metadata (Differentiates booking portals, websites, and counter admission)',
    passedI,
    `Case A has booking link: ${replyA.reply.includes('nzptsfd.telangana.gov.in')}, Case B specifies counter: ${replyB.reply.includes('ticket counter')}, Case C informs counter: ${replyC.reply.includes('on-site ticket counter')}.`
  );
} catch (err) {
  report('TEST I', 'Copilot Response Grounded in Link Metadata', false, err.message);
}

// -----------------------------------------------------------------
// TEST J: No Invented Links (Zero Fabrication)
// -----------------------------------------------------------------
try {
  const unverifiedPlaceLinks = resolveAttractionActionLinks({
    name: 'Mythical Mystery Temple 12345',
  });

  const passedJ =
    unverifiedPlaceLinks.officialBookingUrl === undefined &&
    unverifiedPlaceLinks.websiteUrl === undefined &&
    unverifiedPlaceLinks.bookingLabel === undefined;

  report(
    'TEST J',
    'No Invented Links (Zero fabrication: attractions with no verified links receive undefined)',
    passedJ,
    `BookingUrl: ${unverifiedPlaceLinks.officialBookingUrl}, WebsiteUrl: ${unverifiedPlaceLinks.websiteUrl}.`
  );
} catch (err) {
  report('TEST J', 'No Invented Links', false, err.message);
}

// -----------------------------------------------------------------
// TEST K: Existing Planning Behavior Invariance
// -----------------------------------------------------------------
try {
  // Website metadata must NOT modify attraction category, eligibility, or quality gate
  const candWithWeb = {
    name: 'Golconda Fort',
    categories: ['tourism.sights.fort', 'building.historic'],
    address: 'Ibrahim Bagh, Hyderabad',
    website: 'https://asi.nic.in/',
  };
  const candWithoutWeb = {
    name: 'Golconda Fort',
    categories: ['tourism.sights.fort', 'building.historic'],
    address: 'Ibrahim Bagh, Hyderabad',
  };

  const qgWith = evaluateTouristQualityGate(candWithWeb);
  const qgWithout = evaluateTouristQualityGate(candWithoutWeb);

  const passedK =
    qgWith.decision === qgWithout.decision &&
    qgWith.isEligibleForSightseeing === qgWithout.isEligibleForSightseeing &&
    qgWith.categoryOverride === qgWithout.categoryOverride;

  report(
    'TEST K',
    'Existing Planning Behavior Invariance (Website presence does not alter Tourist Quality Gate decisions)',
    passedK,
    `DecisionWith: "${qgWith.decision}", DecisionWithout: "${qgWithout.decision}", Eligible: ${qgWith.isEligibleForSightseeing}.`
  );
} catch (err) {
  report('TEST K', 'Existing Planning Behavior Invariance', false, err.message);
}

// -----------------------------------------------------------------
// TEST L: Tourist Place Quality Gate Preservation
// -----------------------------------------------------------------
try {
  const sanjaypuriQG = evaluateTouristQualityGate({
    name: 'Sanjaypuri Community Hall',
    categories: ['building.historic', 'heritage'],
    website: 'https://fake-hall-website.org',
  });

  const ultimusQG = evaluateTouristQualityGate({
    name: 'Ultimus Technologies Pvt Ltd',
    categories: ['entertainment.museum'],
    website: 'https://www.ultimus.com',
  });

  const passedL =
    sanjaypuriQG.decision === 'REJECT' &&
    ultimusQG.decision === 'REJECT';

  report(
    'TEST L',
    'Tourist Place Quality Gate Preservation (Community halls & corporate offices still rejected regardless of website)',
    passedL,
    `Sanjaypuri: ${sanjaypuriQG.decision} (${sanjaypuriQG.matchedRule}), Ultimus: ${ultimusQG.decision} (${ultimusQG.matchedRule}).`
  );
} catch (err) {
  report('TEST L', 'Tourist Place Quality Gate Preservation', false, err.message);
}

console.log('================================================================');
console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
