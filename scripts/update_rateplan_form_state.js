const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/[siteId]/_components/RatePlansTab.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add fields to initial state for new plan
content = content.replace(
  /pricing_mode: 'independent', applied_listings: \[\], is_default: false,/,
  "pricing_mode: 'independent', applied_listings: [], is_default: false,\n        same_day_cutoff_hour: null as number | null,\n        pricing_modifier_percent: 0,\n        pricing_modifier_type: 'less',\n        derived_from_plan_id: '',"
);

// 2. Add fields to plan loaded state
content = content.replace(
  /pricing_mode: plan\?\.pricing_mode \|\| 'independent',\n\s*applied_listings: plan\?\.applied_listings \|\| \[\],\n\s*is_default: plan\?\.is_default === 1,/,
  `pricing_mode: plan?.pricing_mode || 'independent',
    applied_listings: plan?.applied_listings || [],
    is_default: plan?.is_default === 1,
    same_day_cutoff_hour: plan?.same_day_cutoff_hour ?? null,
    pricing_modifier_percent: plan?.pricing_modifier_percent ?? 0,
    pricing_modifier_type: plan?.pricing_modifier_type ?? 'less',
    derived_from_plan_id: plan?.derived_from_plan_id ?? '',`
);

content = content.replace(
  /pricing_mode: plan\.pricing_mode \|\| 'independent',\n\s*applied_listings: plan\.applied_listings \|\| \[\],\n\s*is_default: plan\.is_default === 1,/,
  `pricing_mode: plan.pricing_mode || 'independent',
        applied_listings: plan.applied_listings || [],
        is_default: plan.is_default === 1,
        same_day_cutoff_hour: plan.same_day_cutoff_hour ?? null,
        pricing_modifier_percent: plan.pricing_modifier_percent ?? 0,
        pricing_modifier_type: plan.pricing_modifier_type ?? 'less',
        derived_from_plan_id: plan.derived_from_plan_id ?? '',`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Updated Form State');
