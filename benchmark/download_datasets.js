/**
 * External Benchmark Dataset Downloader
 *
 * Downloads and converts external benchmark datasets to local JSON format
 * for use by the i,Robot benchmark runner.
 *
 * Output:
 *   benchmark/data/hle.json          — Humanity's Last Exam questions
 *   benchmark/data/tau2.json         — tau2-bench tasks
 *   benchmark/data/arc_agi2.json     — ARC-AGI-2 puzzles
 *   benchmark/data/vending2_stub.json — Hand-authored vending machine scenarios
 *   benchmark/data/manifest.json     — Download metadata
 *
 * Usage:
 *   node benchmark/download_datasets.js
 *   or called programmatically via downloadAll()
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT_DIR = path.join(__dirname, 'data');

/**
 * Download Humanity's Last Exam (HLE) dataset from HuggingFace.
 * Source: cais/hle
 */
async function downloadHLE(outputDir, maxItems = 100) {
  console.log('[HLE] Downloading Humanity\'s Last Exam...');
  const outputPath = path.join(outputDir, 'hle.json');

  try {
    // Fetch dataset info via HF API (parquet metadata rows endpoint)
    const url = 'https://datasets-server.huggingface.co/rows?dataset=cais/hle&config=default&split=test&offset=0&length=' + maxItems;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HF API returned ${response.status}`);
    }

    const data = await response.json();
    const rows = data.rows || [];

    const items = rows.map((row, idx) => {
      const r = row.row || row;
      return {
        id: r.id || `hle_${idx + 1}`,
        question: r.question || r.text || '',
        answer: r.answer || r.correct_answer || '',
        answer_type: r.answer_type || r.type || 'short_answer',
        category: r.category || r.subject || 'general',
      };
    }).filter(item => item.question.length > 0);

    fs.writeFileSync(outputPath, JSON.stringify(items, null, 2));
    console.log(`[HLE] Saved ${items.length} questions to ${outputPath}`);
    return { success: true, count: items.length, path: outputPath };
  } catch (error) {
    console.error(`[HLE] Download failed: ${error.message}`);
    // Generate fallback stub
    const stub = generateHLEStub();
    fs.writeFileSync(outputPath, JSON.stringify(stub, null, 2));
    console.log(`[HLE] Using ${stub.length} stub questions`);
    return { success: false, count: stub.length, path: outputPath, fallback: true };
  }
}

/**
 * Fallback HLE stub with representative difficult questions.
 */
function generateHLEStub() {
  return [
    { id: 'hle_stub_1', question: 'What is the Kolmogorov complexity of the string "0101010101"? Explain your reasoning.', answer: 'Low complexity — the string has a simple repeating pattern describable by a short program.', answer_type: 'short_answer', category: 'computer_science' },
    { id: 'hle_stub_2', question: 'In category theory, what is the Yoneda lemma and why is it considered fundamental?', answer: 'The Yoneda lemma states that a presheaf is determined by its representable functors. It embeds any category into its category of presheaves.', answer_type: 'short_answer', category: 'mathematics' },
    { id: 'hle_stub_3', question: 'Describe the mechanism by which prions propagate without nucleic acids.', answer: 'Prions are misfolded proteins (PrPSc) that template the conversion of normal PrPC into the misfolded conformation through direct protein-protein interaction.', answer_type: 'short_answer', category: 'biology' },
    { id: 'hle_stub_4', question: 'What is the significance of the Bekenstein-Hawking entropy formula in reconciling quantum mechanics and general relativity?', answer: 'It relates black hole entropy to its horizon area (S = A/4), suggesting spacetime geometry encodes quantum information — a key clue toward quantum gravity.', answer_type: 'short_answer', category: 'physics' },
    { id: 'hle_stub_5', question: 'Explain the P vs NP problem and why its resolution would have practical implications for cryptography.', answer: 'P vs NP asks whether problems whose solutions can be verified quickly can also be solved quickly. If P=NP, most public-key cryptography would be breakable.', answer_type: 'short_answer', category: 'computer_science' },
    { id: 'hle_stub_6', question: 'What is the difference between Type I and Type II errors in hypothesis testing, and how does the Bonferroni correction address the multiple comparisons problem?', answer: 'Type I is false positive, Type II is false negative. Bonferroni divides alpha by the number of tests to control familywise error rate.', answer_type: 'short_answer', category: 'statistics' },
    { id: 'hle_stub_7', question: 'In moral philosophy, how does Rawls\' veil of ignorance differ from utilitarian approaches to justice?', answer: 'Rawls asks what principles would be chosen without knowing one\'s position in society (maximin), while utilitarianism maximizes aggregate welfare regardless of distribution.', answer_type: 'short_answer', category: 'philosophy' },
    { id: 'hle_stub_8', question: 'What is the halting problem and what does its undecidability imply about the limits of computation?', answer: 'No algorithm can determine whether an arbitrary program halts. This proves fundamental limits on what computers can decide — some questions are algorithmically unanswerable.', answer_type: 'short_answer', category: 'computer_science' },
    { id: 'hle_stub_9', question: 'Explain the role of the renormalization group in quantum field theory.', answer: 'The renormalization group describes how physical theories change with the energy scale, allowing removal of infinities and prediction of scale-dependent phenomena.', answer_type: 'short_answer', category: 'physics' },
    { id: 'hle_stub_10', question: 'What is Gödel\'s second incompleteness theorem and what does it imply about mathematical foundations?', answer: 'Any consistent formal system capable of arithmetic cannot prove its own consistency, showing mathematics cannot fully verify its own foundations.', answer_type: 'short_answer', category: 'mathematics' },
  ];
}

/**
 * Download tau2-bench data from HuggingFace.
 * Source: HuggingFaceH4/tau2-bench-data (or similar)
 */
async function downloadTau2(outputDir, maxItems = 30) {
  console.log('[Tau2] Downloading tau2-bench...');
  const outputPath = path.join(outputDir, 'tau2.json');

  try {
    const url = 'https://datasets-server.huggingface.co/rows?dataset=HuggingFaceH4/tau2-bench&config=default&split=test&offset=0&length=' + maxItems;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HF API returned ${response.status}`);
    }

    const data = await response.json();
    const rows = data.rows || [];

    const items = rows.map((row, idx) => {
      const r = row.row || row;
      return {
        id: r.id || `tau2_${idx + 1}`,
        user_scenario: r.user_scenario || r.instruction || r.input || '',
        initial_state: r.initial_state || r.context || {},
        evaluation_criteria: r.evaluation_criteria || r.criteria || '',
        domain: r.domain || r.category || 'general',
      };
    }).filter(item => (item.user_scenario || '').length > 0);

    fs.writeFileSync(outputPath, JSON.stringify(items, null, 2));
    console.log(`[Tau2] Saved ${items.length} tasks to ${outputPath}`);
    return { success: true, count: items.length, path: outputPath };
  } catch (error) {
    console.error(`[Tau2] Download failed: ${error.message}`);
    const stub = generateTau2Stub();
    fs.writeFileSync(outputPath, JSON.stringify(stub, null, 2));
    console.log(`[Tau2] Using ${stub.length} stub tasks`);
    return { success: false, count: stub.length, path: outputPath, fallback: true };
  }
}

/**
 * Fallback tau2-bench stub with representative task scenarios.
 */
function generateTau2Stub() {
  return [
    { id: 'tau2_stub_1', user_scenario: 'I want to return a laptop I bought 3 days ago. The screen has a dead pixel.', initial_state: { order_id: 'ORD-12345', product: 'Laptop Pro 15', purchase_date: '2025-01-10', return_window: 30, warranty: true }, evaluation_criteria: 'Correctly process return within return window, acknowledge warranty', domain: 'retail' },
    { id: 'tau2_stub_2', user_scenario: 'Cancel my subscription but keep my data for 90 days.', initial_state: { user_id: 'U-789', plan: 'Premium', billing_cycle: 'monthly', data_retention_policy: '90 days after cancellation' }, evaluation_criteria: 'Cancel subscription, confirm data retention period, offer alternatives', domain: 'subscription' },
    { id: 'tau2_stub_3', user_scenario: 'I need to reschedule my flight from NYC to LAX. The new date should be next Friday.', initial_state: { booking_ref: 'FL-456', route: 'JFK-LAX', original_date: '2025-01-15', fare_class: 'economy', change_fee: 75 }, evaluation_criteria: 'Check availability, inform of change fee, process reschedule', domain: 'airline' },
    { id: 'tau2_stub_4', user_scenario: 'My internet has been dropping every few hours for the past week. I\'ve already restarted the router.', initial_state: { account: 'ISP-321', plan: '500Mbps', router_model: 'NetGear R7000', known_outages: false, last_tech_visit: '2024-06-15' }, evaluation_criteria: 'Troubleshoot beyond basic steps, offer escalation, schedule technician if needed', domain: 'telecom' },
    { id: 'tau2_stub_5', user_scenario: 'I want to upgrade my checking account to include overdraft protection and a higher daily ATM limit.', initial_state: { account_type: 'Basic Checking', balance: 5200, credit_score: 720, eligible_upgrades: ['Premium Checking', 'Gold Checking'] }, evaluation_criteria: 'Present upgrade options, explain overdraft terms, process upgrade', domain: 'banking' },
    { id: 'tau2_stub_6', user_scenario: 'I received the wrong medication in my prescription order. I got Lisinopril 20mg instead of 10mg.', initial_state: { order_id: 'RX-999', prescribed: 'Lisinopril 10mg', received: 'Lisinopril 20mg', pharmacy: 'MedMail', prescriber: 'Dr. Smith' }, evaluation_criteria: 'Treat as urgent safety issue, arrange correct medication, report error', domain: 'healthcare' },
    { id: 'tau2_stub_7', user_scenario: 'I want to set up automatic bill payments for my electricity, water, and internet from my savings account.', initial_state: { accounts: [{ name: 'Savings', balance: 12000 }], bills: [{ name: 'Electricity', amount: 150 }, { name: 'Water', amount: 45 }, { name: 'Internet', amount: 80 }] }, evaluation_criteria: 'Set up autopay for each bill, confirm amounts and dates, warn about savings account implications', domain: 'banking' },
    { id: 'tau2_stub_8', user_scenario: 'I want to file a noise complaint about my neighbor who plays loud music after 11 PM every weekend.', initial_state: { tenant_id: 'T-567', unit: '4B', neighbor_unit: '4C', lease_quiet_hours: '10 PM - 8 AM', prior_complaints: 0 }, evaluation_criteria: 'Document complaint, reference quiet hours policy, explain next steps and timeline', domain: 'property_management' },
    { id: 'tau2_stub_9', user_scenario: 'I need to add my teenage daughter as an authorized user on my credit card.', initial_state: { cardholder: 'Jane Doe', card_type: 'Visa Platinum', daughter_age: 16, min_auth_user_age: 13, credit_limit: 10000 }, evaluation_criteria: 'Verify age eligibility, explain authorized user vs joint account, set spending limits', domain: 'banking' },
    { id: 'tau2_stub_10', user_scenario: 'I shipped a package to the wrong address and need to redirect it before delivery.', initial_state: { tracking: 'PKG-888', status: 'In Transit', wrong_address: '123 Oak St', correct_address: '456 Elm St', carrier: 'FedEx', redirect_fee: 15 }, evaluation_criteria: 'Check if redirect is possible given transit status, explain fee, process redirect', domain: 'shipping' },
  ];
}

/**
 * Download ARC-AGI-2 puzzles from GitHub.
 * Source: fchollet/ARC-AGI-2
 */
async function downloadArcAGI2(outputDir, maxItems = 20) {
  console.log('[ARC-AGI-2] Downloading ARC-AGI-2 puzzles...');
  const outputPath = path.join(outputDir, 'arc_agi2.json');

  try {
    // Try to fetch the evaluation challenges from GitHub
    const url = 'https://raw.githubusercontent.com/fchollet/ARC-AGI/master/data/evaluation/';
    const listUrl = 'https://api.github.com/repos/fchollet/ARC-AGI/contents/data/evaluation';
    const listResponse = await fetch(listUrl);

    if (!listResponse.ok) {
      throw new Error(`GitHub API returned ${listResponse.status}`);
    }

    const files = await listResponse.json();
    const jsonFiles = files.filter(f => f.name.endsWith('.json')).slice(0, maxItems);

    const puzzles = [];
    for (const file of jsonFiles) {
      try {
        const puzzleResponse = await fetch(file.download_url);
        if (!puzzleResponse.ok) continue;

        const puzzle = await puzzleResponse.json();
        // Filter for small grids (≤10x10)
        const isSmall = isSmallGridPuzzle(puzzle);
        if (!isSmall && puzzles.length >= maxItems / 2) continue;

        puzzles.push({
          id: file.name.replace('.json', ''),
          train: puzzle.train || [],
          test: puzzle.test || [],
          grid_size: getMaxGridSize(puzzle),
        });

        if (puzzles.length >= maxItems) break;
      } catch {
        // Skip individual puzzle errors
      }
    }

    fs.writeFileSync(outputPath, JSON.stringify(puzzles, null, 2));
    console.log(`[ARC-AGI-2] Saved ${puzzles.length} puzzles to ${outputPath}`);
    return { success: true, count: puzzles.length, path: outputPath };
  } catch (error) {
    console.error(`[ARC-AGI-2] Download failed: ${error.message}`);
    const stub = generateArcStub();
    fs.writeFileSync(outputPath, JSON.stringify(stub, null, 2));
    console.log(`[ARC-AGI-2] Using ${stub.length} stub puzzles`);
    return { success: false, count: stub.length, path: outputPath, fallback: true };
  }
}

/**
 * Check if a puzzle has only small grids (≤10x10).
 */
function isSmallGridPuzzle(puzzle) {
  const allGrids = [
    ...(puzzle.train || []).flatMap(p => [p.input, p.output]),
    ...(puzzle.test || []).flatMap(p => [p.input, p.output].filter(Boolean)),
  ];
  return allGrids.every(grid =>
    Array.isArray(grid) && grid.length <= 10 && grid.every(row => Array.isArray(row) && row.length <= 10)
  );
}

/**
 * Get the maximum grid dimension in a puzzle.
 */
function getMaxGridSize(puzzle) {
  const allGrids = [
    ...(puzzle.train || []).flatMap(p => [p.input, p.output]),
    ...(puzzle.test || []).flatMap(p => [p.input, p.output].filter(Boolean)),
  ];
  let maxH = 0, maxW = 0;
  for (const grid of allGrids) {
    if (Array.isArray(grid)) {
      maxH = Math.max(maxH, grid.length);
      for (const row of grid) {
        if (Array.isArray(row)) maxW = Math.max(maxW, row.length);
      }
    }
  }
  return `${maxH}x${maxW}`;
}

/**
 * Fallback ARC puzzles (hand-authored small grid puzzles).
 */
function generateArcStub() {
  return [
    {
      id: 'arc_stub_1',
      train: [
        { input: [[0,0,0],[0,1,0],[0,0,0]], output: [[1,1,1],[1,0,1],[1,1,1]] },
        { input: [[0,0,0,0],[0,1,1,0],[0,0,0,0]], output: [[1,1,1,1],[1,0,0,1],[1,1,1,1]] },
      ],
      test: [{ input: [[0,0,0],[0,1,0],[0,1,0],[0,0,0]], output: [[1,1,1],[1,0,1],[1,0,1],[1,1,1]] }],
      grid_size: '4x4',
    },
    {
      id: 'arc_stub_2',
      train: [
        { input: [[1,0],[0,1]], output: [[0,1],[1,0]] },
        { input: [[1,0,0],[0,1,0],[0,0,1]], output: [[0,0,1],[0,1,0],[1,0,0]] },
      ],
      test: [{ input: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]], output: [[0,0,0,1],[0,0,1,0],[0,1,0,0],[1,0,0,0]] }],
      grid_size: '4x4',
    },
    {
      id: 'arc_stub_3',
      train: [
        { input: [[0,0,0],[0,2,0],[0,0,0]], output: [[2,2,2],[2,2,2],[2,2,2]] },
        { input: [[0,0],[0,3]], output: [[3,3],[3,3]] },
      ],
      test: [{ input: [[0,0,0,0],[0,0,0,0],[0,0,5,0],[0,0,0,0]], output: [[5,5,5,5],[5,5,5,5],[5,5,5,5],[5,5,5,5]] }],
      grid_size: '4x4',
    },
    {
      id: 'arc_stub_4',
      train: [
        { input: [[1,2,3]], output: [[3,2,1]] },
        { input: [[4,5,6,7]], output: [[7,6,5,4]] },
      ],
      test: [{ input: [[8,9,1,2,3]], output: [[3,2,1,9,8]] }],
      grid_size: '1x5',
    },
    {
      id: 'arc_stub_5',
      train: [
        { input: [[1,0],[0,0]], output: [[1,0],[0,0],[0,0],[1,0]] },
        { input: [[0,2],[0,0]], output: [[0,2],[0,0],[0,0],[0,2]] },
      ],
      test: [{ input: [[0,0,3],[0,0,0]], output: [[0,0,3],[0,0,0],[0,0,0],[0,0,3]] }],
      grid_size: '4x3',
    },
  ];
}

/**
 * Generate hand-authored vending machine decision scenarios.
 */
function generateVendingStub(outputDir) {
  console.log('[Vending2] Generating vending machine scenarios...');
  const outputPath = path.join(outputDir, 'vending2_stub.json');

  const scenarios = [
    {
      id: 'vend_1',
      scenario: 'A customer inserts $5.00 and selects item A3 (priced $4.50). The machine has 2 units of A3 in stock. Process the transaction.',
      expected_action: 'dispense',
      expected_change: 0.50,
      context: { balance: 5.00, item: 'A3', price: 4.50, stock: 2 },
      evaluation: 'Must dispense item and return $0.50 change',
    },
    {
      id: 'vend_2',
      scenario: 'A customer inserts $2.00 and selects item B1 (priced $3.25). What should the machine do?',
      expected_action: 'insufficient_funds',
      expected_change: 0,
      context: { balance: 2.00, item: 'B1', price: 3.25, stock: 5 },
      evaluation: 'Must indicate insufficient funds, display amount needed ($1.25 more)',
    },
    {
      id: 'vend_3',
      scenario: 'A customer selects item C2 (priced $1.75) after inserting $2.00. The item is out of stock. What should happen?',
      expected_action: 'out_of_stock',
      expected_change: 0,
      context: { balance: 2.00, item: 'C2', price: 1.75, stock: 0 },
      evaluation: 'Must indicate out of stock, suggest alternatives, keep balance for next selection',
    },
    {
      id: 'vend_4',
      scenario: 'The machine has $3.50 in coins for change. A customer inserts a $10 bill and selects item D1 ($7.00). Can the machine complete the transaction?',
      expected_action: 'insufficient_change',
      expected_change: 3.00,
      context: { balance: 10.00, item: 'D1', price: 7.00, stock: 1, change_available: 3.50 },
      evaluation: 'Must recognize it can complete ($3.00 change needed, $3.50 available) and dispense',
    },
    {
      id: 'vend_5',
      scenario: 'A customer inserts $5.00, selects item A1 ($2.00, dispensed), then selects item A2 ($2.50) with remaining $3.00 balance. Process both.',
      expected_action: 'multi_purchase',
      expected_change: 0.50,
      context: { balance: 5.00, items: [{ id: 'A1', price: 2.00 }, { id: 'A2', price: 2.50 }], stock: { A1: 3, A2: 2 } },
      evaluation: 'Must handle sequential purchases, track running balance, return final change',
    },
    {
      id: 'vend_6',
      scenario: 'A customer presses the refund button after inserting $3.75. The machine has enough coins. Process the refund.',
      expected_action: 'refund',
      expected_change: 3.75,
      context: { balance: 3.75, change_available: 10.00 },
      evaluation: 'Must return full amount, reset session',
    },
    {
      id: 'vend_7',
      scenario: 'Item E1 costs $1.50. A customer inserts coins: $0.25, $0.25, $0.25, $0.25, $0.25, $0.25 (total $1.50 in quarters). Is exact change achieved?',
      expected_action: 'dispense',
      expected_change: 0,
      context: { balance: 1.50, item: 'E1', price: 1.50, stock: 1, coins: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25] },
      evaluation: 'Must recognize exact change, dispense without change',
    },
    {
      id: 'vend_8',
      scenario: 'During a purchase, the power flickers. The customer had inserted $4.00 and selected item F1 ($3.00). The item was dispensed but change ($1.00) was not returned. How should the machine handle this on restart?',
      expected_action: 'recovery',
      expected_change: 1.00,
      context: { pre_failure_state: { balance: 4.00, item: 'F1', price: 3.00, dispensed: true, change_returned: false } },
      evaluation: 'Must detect incomplete transaction, either log for refund or return change on restart',
    },
    {
      id: 'vend_9',
      scenario: 'The machine offers a "buy 2 get 1 free" promotion on items in row G. A customer selects G1, G2, and G3 (each $2.00). Apply the promotion.',
      expected_action: 'promotional_purchase',
      expected_change: null,
      context: { items: ['G1', 'G2', 'G3'], unit_price: 2.00, promotion: 'buy_2_get_1_free', stock: { G1: 5, G2: 5, G3: 5 } },
      evaluation: 'Must apply promotion correctly (charge $4.00 for 3 items), verify stock for all',
    },
    {
      id: 'vend_10',
      scenario: 'A customer inserts a bill that the validator rejects (appears counterfeit or damaged). The customer insists it\'s valid. What should the machine do?',
      expected_action: 'reject_bill',
      expected_change: 0,
      context: { bill_status: 'rejected', customer_insists: true },
      evaluation: 'Must reject invalid currency, suggest using different bill or coins, provide customer service number',
    },
  ];

  fs.writeFileSync(outputPath, JSON.stringify(scenarios, null, 2));
  console.log(`[Vending2] Saved ${scenarios.length} scenarios to ${outputPath}`);
  return { success: true, count: scenarios.length, path: outputPath };
}

/**
 * Download all external benchmark datasets.
 * Runs all downloaders, writes manifest.json with metadata.
 * Each benchmark fails gracefully — a failed download doesn't block others.
 */
async function downloadAll(outputDir = DEFAULT_OUTPUT_DIR) {
  console.log('=== External Benchmark Dataset Download ===\n');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = {};
  const startTime = Date.now();

  // Download each benchmark (sequential to avoid rate limits)
  results.hle = await downloadHLE(outputDir);
  results.tau2 = await downloadTau2(outputDir);
  results.arc_agi2 = await downloadArcAGI2(outputDir);
  results.vending2 = generateVendingStub(outputDir);

  // Write manifest
  const manifest = {
    downloaded_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    benchmarks: {},
  };

  for (const [name, result] of Object.entries(results)) {
    manifest.benchmarks[name] = {
      count: result.count,
      success: result.success !== false,
      fallback: result.fallback || false,
      path: path.basename(result.path),
    };
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n=== Manifest written to ${manifestPath} ===`);
  console.log(`Total time: ${manifest.duration_ms}ms`);

  return manifest;
}

/**
 * Check if datasets already exist and are recent.
 * @param {string} outputDir
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 7 days)
 * @returns {boolean}
 */
function datasetsExist(outputDir = DEFAULT_OUTPUT_DIR, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return false;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const downloadedAt = new Date(manifest.downloaded_at).getTime();
    return (Date.now() - downloadedAt) < maxAgeMs;
  } catch {
    return false;
  }
}

// CLI entry point
if (require.main === module) {
  downloadAll().then(manifest => {
    console.log('\nSummary:', JSON.stringify(manifest.benchmarks, null, 2));
  }).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  downloadAll,
  downloadHLE,
  downloadTau2,
  downloadArcAGI2,
  generateVendingStub,
  datasetsExist,
  DEFAULT_OUTPUT_DIR,
};
