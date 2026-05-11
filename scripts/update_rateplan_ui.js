const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/[siteId]/_components/RatePlansTab.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Pass allPlans
content = content.replace(
  /plan=\{selectedPlanId === 'new' \? null : selectedPlan\}/,
  "plan={selectedPlanId === 'new' ? null : selectedPlan}\n            allPlans={plans}"
);

// 2. Add allPlans to component signature
content = content.replace(
  /function RatePlanForm\(\{ siteId, plan, listings, onSaved, onDeleted \}: \{ siteId: string; plan\?: RatePlan \| null; listings: any\[\]; onSaved: \(\) => void; onDeleted: \(\) => void \}\) \{/,
  "function RatePlanForm({ siteId, plan, listings, allPlans, onSaved, onDeleted }: { siteId: string; plan?: RatePlan | null; listings: any[]; allPlans: RatePlan[]; onSaved: () => void; onDeleted: () => void }) {"
);

// 3. Add derived fields UI
const pricingModeHtml = `Ціна цього тарифного плану залежить від цін інших тарифних планів.</div>
            </div>
          </label>
        </div>
      </div>`;

const newPricingModeHtml = `Ціна цього тарифного плану залежить від цін інших тарифних планів.</div>
              {form.pricing_mode === 'derived' && (
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14 }}>Ціна становить</span>
                  <input type="number" min="0" max="100" className="form-input" style={{ width: 80, padding: '6px 10px' }} value={form.pricing_modifier_percent} onChange={e => setForm(f => ({ ...f, pricing_modifier_percent: +e.target.value }))} />
                  <span style={{ fontSize: 14 }}>%</span>
                  <select className="form-input" style={{ width: 100, padding: '6px 10px' }} value={form.pricing_modifier_type} onChange={e => setForm(f => ({ ...f, pricing_modifier_type: e.target.value }))}>
                    <option value="less">менше</option>
                    <option value="more">більше</option>
                  </select>
                  <span style={{ fontSize: 14 }}>ніж</span>
                  <select className="form-input" style={{ width: 200, padding: '6px 10px' }} value={form.derived_from_plan_id} onChange={e => setForm(f => ({ ...f, derived_from_plan_id: e.target.value }))}>
                    <option value="" disabled>Оберіть тарифний план</option>
                    {allPlans.filter(p => p.id !== plan?.id).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </label>
        </div>
      </div>`;

content = content.replace(pricingModeHtml, newPricingModeHtml);

fs.writeFileSync(file, content, 'utf8');
console.log('Updated RatePlansTab.tsx');
