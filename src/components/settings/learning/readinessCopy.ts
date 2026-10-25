export const LEARNING_EXCLUSION_LABELS: Record<string, string> = {
  'capture-gap': 'Live readings have a gap',
  'resource-increased': 'Fuel or virtual energy increased during the lap',
  'context-changed': 'Driver, car, tyres or weather changed during the lap',
  'context-changed-at-crossing': 'Conditions changed at the lap crossing',
  'pit-lap': 'Lap includes a pit visit',
  'invalid-live-lap': 'Game marked the lap invalid',
  'caution-or-start': 'Lap includes a start or caution period',
  damage: 'Significant damage affected the lap',
  'unobserved-lap': 'Lap was not fully observed',
  'lap-not-clean-representative': 'Lap is not clean and representative',
  'start-lap': 'Standing-start lap',
  'manifest-identity-unknown': 'Game patch, layout or car is unresolved',
  'stale-projection': 'Session evidence changed and needs reprocessing',
  'ambiguous-xml-lap': 'Lap identity is ambiguous',
  'ambiguous-outcome': 'More than one outcome matches this lap',
  'ambiguous-forecast': 'More than one forecast matches this lap',
  'missing-forecast': 'No forecast was recorded at lap start',
  'invalid-forecast': 'Lap-start forecast is unavailable',
  'anchor-missing-or-ambiguous': 'Lap-start clock is missing or ambiguous',
  'anchor-duration-mismatch': 'Recorded lap duration does not match results',
  'xml-duration-invalid': 'Results have no valid lap duration',
  'xml-condition-unknown': 'Lap weather is unresolved',
  'outcome-version-unsupported': 'Outcome uses an unsupported recording format',
  'forecast-version-unsupported': 'Forecast uses an unsupported recording format',
  'outcome-actual-invalid': 'Measured consumption is invalid',
  'forecast-prediction-invalid': 'Predicted consumption is unavailable',
  'forecast-prediction-source-unknown': 'Forecast source is unresolved',
  'forecast-model-version-invalid': 'Predictor version is unresolved',
  'forecast-condition-mismatch': 'Forecast and lap weather differ',
  'missing-compound': 'Tyre compound is unresolved',
  'forecast-time-invalid': 'Forecast was not captured at lap start',
  'forecast-anchor-start-mismatch': 'Forecast lap-start clock does not match',
  'outcome-crossing-mismatch': 'Measured outcome does not match the finish crossing',
  'outcome-before-forecast': 'Outcome predates its forecast',
  'forecast-kind-mismatch': 'Forecast and measurement use different resources',
};

export const LEARNING_GATE_LABELS: Record<string, string> = {
  'insufficient-training-sessions': 'Too few earlier sessions',
  'insufficient-training-examples': 'Too few earlier measurements',
  'insufficient-test-sessions': 'Too few later sessions',
  'insufficient-test-examples': 'Too few later measurements',
  'mae-not-improved': 'Mean prediction error did not improve enough',
  'p95-regressed': 'Large prediction errors increased (95th percentile)',
  'underprediction-count-regressed': 'More consumption underpredictions',
  'underprediction-amount-regressed': 'Average consumption shortfall increased',
};

export function exclusionSummary(exclusions: Record<string, number>): Array<{ label: string; count: number }> {
  const result = new Map<string, number>();
  for (const [reason, count] of Object.entries(exclusions)) {
    const label = LEARNING_EXCLUSION_LABELS[reason] ?? 'Other eligibility checks';
    result.set(label, (result.get(label) ?? 0) + count);
  }
  return [...result].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
