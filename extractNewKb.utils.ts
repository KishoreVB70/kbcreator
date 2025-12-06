const fs = require("fs");

interface Strategy {
  title: string;
  target: "parent" | "both" | "child";
  domain: "reflective" | "behavioral" | "somatic" | "emotional";
  function: "prevention" | "transition" | "repair" | "intervention";
  effort: "low" | "medium" | "high";
  ageBand: string;
  structureLevel: number;
  emotionalFocus: number;
  focusOrientation: number;
  requirements: string[];
  coreConcept: string;
  keyResearchFindings: string[];
  implementation: string;
}

function parseStrategiesDocument(content: string): Strategy[] {
  const strategies: Strategy[] = [];

  // Split by title markers - each entry starts with 'title:'
  const entries = content.split(/(?=title:\s*")/);

  for (const entry of entries) {
    if (!entry.trim() || !entry.includes('title:')) continue;

    try {
      const strategy = parseEntry(entry);
      if (strategy) {
        strategies.push(strategy);
      }
    } catch (error) {
      console.error("Error parsing entry:", error);
    }
  }

  return strategies;
}

function parseEntry(entry: string): Strategy | null {
  // Extract title
  const titleMatch = entry.match(/title:\s*"([^"]+)"/);
  if (!titleMatch) return null;

  // Extract metadata fields
  const targetMatch = entry.match(/target:\s*"([^"]+)"/);
  const domainMatch = entry.match(/domain:\s*"([^"]+)"/);
  const functionMatch = entry.match(/function:\s*"([^"]+)"/);
  const effortMatch = entry.match(/effort:\s*"([^"]+)"/);
  const ageBandMatch = entry.match(/age_band:\s*"([^"]+)"/);
  const structureLevelMatch = entry.match(/structure_level:\s*([\d.]+)/);
  const emotionalFocusMatch = entry.match(/emotional_focus:\s*([\d.]+)/);
  const focusOrientationMatch = entry.match(/focus_orientation:\s*([\d.]+)/);

  // Extract requirements - handle both array format [] and multi-line format
  let requirements: string[] = [];
  
  // First try array format: requirements: []
  const requirementsArrayMatch = entry.match(/requirements:\s*\[([\s\S]*?)\]/);
  if (requirementsArrayMatch) {
    const reqContent = requirementsArrayMatch[1].trim();
    if (reqContent) {
      requirements = reqContent
        .split(/\n/)
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
    }
  } else {
    // Try multi-line format: requirements:\n item1\n item2
    const requirementsMultiMatch = entry.match(/requirements:\s*\n([\s\S]*?)(?=\n\n|CORE CONCEPT)/);
    if (requirementsMultiMatch) {
      requirements = requirementsMultiMatch[1]
        .split(/\n/)
        .map((r) => r.trim())
        .filter((r) => r.length > 0 && !r.startsWith("CORE"));
    }
  }

  // Extract CORE CONCEPT
  const coreConceptMatch = entry.match(
    /CORE CONCEPT\s*([\s\S]*?)(?=KEY RESEARCH FINDINGS|$)/
  );
  const coreConcept = coreConceptMatch
    ? coreConceptMatch[1].trim()
    : "";

  // Extract KEY RESEARCH FINDINGS
  const findingsMatch = entry.match(
    /KEY RESEARCH FINDINGS\s*([\s\S]*?)(?=IMPLEMENTATION|$)/
  );
  let keyResearchFindings: string[] = [];
  if (findingsMatch) {
    // Split by double newlines or citation patterns to separate findings
    keyResearchFindings = findingsMatch[1]
      .split(/\n\n+/)
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  }

  // Extract IMPLEMENTATION
  const implementationMatch = entry.match(
    /IMPLEMENTATION\s*([\s\S]*?)(?=title:|$)/
  );
  const implementation = implementationMatch
    ? implementationMatch[1].trim()
    : "";

  return {
    title: titleMatch[1],
    target: (targetMatch?.[1] || "parent") as Strategy["target"],
    domain: (domainMatch?.[1] || "reflective") as Strategy["domain"],
    function: (functionMatch?.[1] || "prevention") as Strategy["function"],
    effort: (effortMatch?.[1] || "medium") as Strategy["effort"],
    ageBand: ageBandMatch?.[1] || "all",
    structureLevel: parseFloat(structureLevelMatch?.[1] || "0.5"),
    emotionalFocus: parseFloat(emotionalFocusMatch?.[1] || "0.5"),
    focusOrientation: parseFloat(focusOrientationMatch?.[1] || "0.5"),
    requirements,
    coreConcept,
    keyResearchFindings,
    implementation,
  };
}

// Main execution
const inputFile = process.argv[2] || "input.txt";
const outputFile = process.argv[3] || "strategies.json";

try {
  const content = fs.readFileSync(inputFile, "utf-8");
  const strategies = parseStrategiesDocument(content);

  fs.writeFileSync(outputFile, JSON.stringify(strategies, null, 2));

  console.log(`✅ Parsed ${strategies.length} strategies`);
  console.log(`📄 Output saved to: ${outputFile}`);
} catch (error) {
  console.error("Error:", error);
  process.exit(1);
}

// Export for use as a module
module.exports = { parseStrategiesDocument };