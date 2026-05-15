// ════════════════════════════════════════════════════════════
// Finance module — public API surface
//
// Read endpoints are direct re-exports (Turbopack requires this for HTTP
// route handler detection — `export const x = _imported` breaks method
// resolution at the route layer).
//
// Write endpoints are wrapped with `withPermission(...)` (PR #14, RBAC):
//   - manage_payments         → fin_operations CRUD
//   - manage_finance_settings → accounts, categories, projects, counterparties,
//                               tags, exchange-rates, budgets, auto-rules,
//                               recurring, capex, accruals, invoices regenerate
//   - import_bank_data        → bank statement import + bank inbox run/test
//   - view_finance            → reads (no enforcement here; UI hides nav)
//
// Internal payment-bridge functions are intentionally NOT wrapped — they are
// programmatic entry points called from other modules without an HTTP request.
// ════════════════════════════════════════════════════════════

import { withPermission } from './_guard';

// ─── Reports & matrices (read) ────────────────────────────────
export {
  getFinanceOverview, getPnl, getCashflow, getExpectedPayments,
  getCashflowMatrix, getPnlMatrix, getFinancialIndicators, getOperationsForDrillDown,
  getBalanceSheet, getProjectProfitability, getAccountStatement, getPlanFactReport,
} from './reports.handlers';

// ─── Budgets ──────────────────────────────────────────────────
export { listBudgets } from './budgets.handlers';
import { upsertBudget as _upsertBudget, deleteBudget as _deleteBudget } from './budgets.handlers';
export const upsertBudget = withPermission('manage_finance_settings', _upsertBudget);
export const deleteBudget = withPermission('manage_finance_settings', _deleteBudget);

// ─── Expense categories (legacy compat) ───────────────────────
export { listExpenseCategories } from './expense-categories.handlers';
import { createExpenseCategory as _createExpenseCategory } from './expense-categories.handlers';
export const createExpenseCategory = withPermission('manage_finance_settings', _createExpenseCategory);

// ─── Categories (PR #2) ───────────────────────────────────────
export { listCategories, getCategoryTree } from './categories.handlers';
import {
  createCategory as _createCategory, updateCategory as _updateCategory,
  archiveCategory as _archiveCategory, deleteCategory as _deleteCategory,
  moveCategory as _moveCategory,
} from './categories.handlers';
export const createCategory  = withPermission('manage_finance_settings', _createCategory);
export const updateCategory  = withPermission('manage_finance_settings', _updateCategory);
export const archiveCategory = withPermission('manage_finance_settings', _archiveCategory);
export const deleteCategory  = withPermission('manage_finance_settings', _deleteCategory);
export const moveCategory    = withPermission('manage_finance_settings', _moveCategory);

// ─── Business units (legacy read) ─────────────────────────────
export { listBusinessUnits } from './business-units.handlers';

// ─── Projects (PR #3) ─────────────────────────────────────────
export { listProjects, getProjectTree } from './projects.handlers';
import {
  createProject as _createProject, updateProject as _updateProject,
  archiveProject as _archiveProject, deleteProject as _deleteProject,
  moveProject as _moveProject,
} from './projects.handlers';
export const createProject  = withPermission('manage_finance_settings', _createProject);
export const updateProject  = withPermission('manage_finance_settings', _updateProject);
export const archiveProject = withPermission('manage_finance_settings', _archiveProject);
export const deleteProject  = withPermission('manage_finance_settings', _deleteProject);
export const moveProject    = withPermission('manage_finance_settings', _moveProject);

// ─── Counterparties (PR #4) ───────────────────────────────────
export {
  listCounterparties, getCounterpartyTree,
  matchCounterpartyByText, getAliasSuggestions,
} from './counterparties.handlers';
import {
  createCounterparty as _createCounterparty, updateCounterparty as _updateCounterparty,
  archiveCounterparty as _archiveCounterparty, deleteCounterparty as _deleteCounterparty,
  moveCounterparty as _moveCounterparty,
} from './counterparties.handlers';
export const createCounterparty  = withPermission('manage_finance_settings', _createCounterparty);
export const updateCounterparty  = withPermission('manage_finance_settings', _updateCounterparty);
export const archiveCounterparty = withPermission('manage_finance_settings', _archiveCounterparty);
export const deleteCounterparty  = withPermission('manage_finance_settings', _deleteCounterparty);
export const moveCounterparty    = withPermission('manage_finance_settings', _moveCounterparty);

// ─── Tags (PR #5) ─────────────────────────────────────────────
export { listTags } from './tags.handlers';
import {
  createTag as _createTag, updateTag as _updateTag,
  archiveTag as _archiveTag, deleteTag as _deleteTag,
} from './tags.handlers';
export const createTag  = withPermission('manage_finance_settings', _createTag);
export const updateTag  = withPermission('manage_finance_settings', _updateTag);
export const archiveTag = withPermission('manage_finance_settings', _archiveTag);
export const deleteTag  = withPermission('manage_finance_settings', _deleteTag);

// ─── CapEx (legacy) ───────────────────────────────────────────
export { listCapex } from './capex.handlers';
export { getCapexItem } from './capex-item.handlers';
import { createCapex as _createCapex } from './capex.handlers';
import { updateCapexItem as _updateCapexItem, deleteCapexItem as _deleteCapexItem } from './capex-item.handlers';
export const createCapex     = withPermission('manage_finance_settings', _createCapex);
export const updateCapexItem = withPermission('manage_finance_settings', _updateCapexItem);
export const deleteCapexItem = withPermission('manage_finance_settings', _deleteCapexItem);

// ─── Accruals (legacy) ────────────────────────────────────────
export { listAccruals } from './accruals.handlers';
export { getAccrual } from './accrual.handlers';
import { createAccrual as _createAccrual } from './accruals.handlers';
import { updateAccrual as _updateAccrual, deleteAccrual as _deleteAccrual } from './accrual.handlers';
export const createAccrual = withPermission('manage_finance_settings', _createAccrual);
export const updateAccrual = withPermission('manage_finance_settings', _updateAccrual);
export const deleteAccrual = withPermission('manage_finance_settings', _deleteAccrual);

// ─── Bank statements (manual import + transaction edit) ───────
export { listBankStatements, listBankTransactions } from './bank.handlers';
import {
  updateBankTransaction as _updateBankTransaction,
  importBankStatement as _importBankStatement,
} from './bank.handlers';
export const updateBankTransaction = withPermission('import_bank_data', _updateBankTransaction);
export const importBankStatement   = withPermission('import_bank_data', _importBankStatement);

// ─── Invoices ─────────────────────────────────────────────────
export {
  listInvoices, getInvoiceHtml, getInvoiceByReservation,
  generateInvoiceForReservation, reissueInvoiceForReservation,
} from './invoices.handlers';
import { reissueInvoiceHandler as _reissueInvoiceHandler } from './invoices.handlers';
export const reissueInvoiceHandler = withPermission('manage_finance_settings', _reissueInvoiceHandler);

// ─── Accounts (PR #1) ─────────────────────────────────────────
export { listAccounts } from './accounts.handlers';
import {
  createAccount as _createAccount, updateAccount as _updateAccount,
  archiveAccount as _archiveAccount, deleteAccount as _deleteAccount,
  reconcileAccount as _reconcileAccount,
} from './accounts.handlers';
export const createAccount    = withPermission('manage_finance_settings', _createAccount);
export const updateAccount    = withPermission('manage_finance_settings', _updateAccount);
export const archiveAccount   = withPermission('manage_finance_settings', _archiveAccount);
export const deleteAccount    = withPermission('manage_finance_settings', _deleteAccount);
export const reconcileAccount = withPermission('manage_finance_settings', _reconcileAccount);

// ─── Exchange rates (PR #1) ───────────────────────────────────
export { listExchangeRates } from './exchange-rates.handlers';
import {
  upsertExchangeRate as _upsertExchangeRate,
  deleteExchangeRate as _deleteExchangeRate,
} from './exchange-rates.handlers';
export const upsertExchangeRate = withPermission('manage_finance_settings', _upsertExchangeRate);
export const deleteExchangeRate = withPermission('manage_finance_settings', _deleteExchangeRate);

// ─── Audit log ────────────────────────────────────────────────
export { getFinanceLog } from './log.handlers';

// ─── Operations (PR #6) — manage_payments ─────────────────────
export {
  listOperations, getOperation,
  getReservationPaymentTotals, recalcReservationPaymentStatus,
} from './operations.handlers';
import {
  createOperation as _createOperation, updateOperation as _updateOperation,
  deleteOperation as _deleteOperation, duplicateOperation as _duplicateOperation,
  applyRecurringSuggestion as _applyRecurringSuggestion,
} from './operations.handlers';
export const createOperation    = withPermission('manage_payments', _createOperation);
export const updateOperation    = withPermission('manage_payments', _updateOperation);
export const deleteOperation    = withPermission('manage_payments', _deleteOperation);
export const duplicateOperation = withPermission('manage_payments', _duplicateOperation);
export const applyRecurringSuggestion = withPermission('manage_payments', _applyRecurringSuggestion);

// ─── Payment bridge — INTERNAL (no HTTP, no guard) ────────────
export {
  createPaymentOperation, hasPaymentOperation, deletePaymentOperationsForReservation,
} from './payment-bridge';

// ─── Auto-rules (PR #7) ───────────────────────────────────────
export { listAutoRules } from './auto-rules.handlers';
import {
  createAutoRule as _createAutoRule, updateAutoRule as _updateAutoRule,
  deleteAutoRule as _deleteAutoRule, toggleAutoRule as _toggleAutoRule,
  moveAutoRule as _moveAutoRule,
  applyAutoRulesToOperations as _applyAutoRulesToOperations,
  autoMatchCounterpartiesAllOps as _autoMatchCounterpartiesAllOps,
} from './auto-rules.handlers';
export const createAutoRule = withPermission('manage_finance_settings', _createAutoRule);
export const updateAutoRule = withPermission('manage_finance_settings', _updateAutoRule);
export const deleteAutoRule = withPermission('manage_finance_settings', _deleteAutoRule);
export const toggleAutoRule = withPermission('manage_finance_settings', _toggleAutoRule);
export const moveAutoRule   = withPermission('manage_finance_settings', _moveAutoRule);
export const applyAutoRulesToOperations    = withPermission('manage_finance_settings', _applyAutoRulesToOperations);
export const autoMatchCounterpartiesAllOps = withPermission('manage_finance_settings', _autoMatchCounterpartiesAllOps);

// ─── Recurring templates + calendar (PR #8) ───────────────────
export { listRecurringTemplates } from './recurring.handlers';
import {
  createRecurringTemplate as _createRecurringTemplate,
  updateRecurringTemplate as _updateRecurringTemplate,
  deleteRecurringTemplate as _deleteRecurringTemplate,
  toggleRecurringTemplate as _toggleRecurringTemplate,
  runRecurringNow as _runRecurringNow,
  runAllDue as _runAllDue,
} from './recurring.handlers';
export const createRecurringTemplate = withPermission('manage_finance_settings', _createRecurringTemplate);
export const updateRecurringTemplate = withPermission('manage_finance_settings', _updateRecurringTemplate);
export const deleteRecurringTemplate = withPermission('manage_finance_settings', _deleteRecurringTemplate);
export const toggleRecurringTemplate = withPermission('manage_finance_settings', _toggleRecurringTemplate);
export const runRecurringNow         = withPermission('manage_finance_settings', _runRecurringNow);
export const runAllDue               = withPermission('manage_finance_settings', _runAllDue);

export { getCalendarMonth } from './calendar.handlers';

// ─── Bank inbox (PR #11) — import_bank_data ───────────────────
export { listBankInboxes } from './bank-inbox.handlers';
import {
  createBankInbox as _createBankInbox, updateBankInbox as _updateBankInbox,
  deleteBankInbox as _deleteBankInbox, toggleBankInbox as _toggleBankInbox,
  testBankInbox as _testBankInbox, runBankInboxNow as _runBankInboxNow,
  runAllInboxes as _runAllInboxes,
} from './bank-inbox.handlers';
export const createBankInbox = withPermission('import_bank_data', _createBankInbox);
export const updateBankInbox = withPermission('import_bank_data', _updateBankInbox);
export const deleteBankInbox = withPermission('import_bank_data', _deleteBankInbox);
export const toggleBankInbox = withPermission('import_bank_data', _toggleBankInbox);
export const testBankInbox   = withPermission('import_bank_data', _testBankInbox);
export const runBankInboxNow = withPermission('import_bank_data', _runBankInboxNow);
export const runAllInboxes   = withPermission('import_bank_data', _runAllInboxes);

// ─── Cron-driven bank inbox poll ──────────────────────────────
// Not wrapped with withPermission — authenticates via X-Cron-Secret
// header against process.env.CRON_SECRET. Meant for external crontab.
export { pollBankInboxesFromCron } from './cron-bank-inbox.handlers';

// ─── Exports (PR #12) — read (no guard) ───────────────────────
export {
  exportOperations, exportCashflow, exportPnl, exportStatement,
} from './export.handlers';

// ─── Clearing accounts (PR #15) — read + manage_finance_settings ─
export { listClearingAccounts, listReceivables } from './clearing.handlers';
import { backfillReceivablesHandler as _backfillReceivablesHandler } from './clearing.handlers';
export const backfillReceivablesHandler = withPermission('manage_finance_settings', _backfillReceivablesHandler);

// ─── Statement uploads (PR #16) — import_bank_data ─────────────
export { listStatementUploads } from './statement-upload.handlers';
import { uploadStatement as _uploadStatement } from './statement-upload.handlers';
export const uploadStatement = withPermission('import_bank_data', _uploadStatement);

// ─── Telegram bridge (PR #17) — bot writes via Bearer token, no session ─
// Auth is handled inside each handler via TELEGRAM_BRIDGE_TOKEN env, so
// these are NOT wrapped with withPermission (the bot has no user session).
export {
  recordTelegramOperation, listTelegramOperations, listTelegramCategories,
} from './telegram-bridge.handlers';

// ─── Attachments (PR #23) — manage_payments for write, view_finance for read ─
export { listOperationAttachments, downloadAttachment, getAttachmentCounts } from './attachments.handlers';
import {
  uploadAttachment as _uploadAttachment,
  deleteAttachment as _deleteAttachment,
} from './attachments.handlers';
export const uploadAttachment = withPermission('manage_payments', _uploadAttachment);
export const deleteAttachment = withPermission('manage_payments', _deleteAttachment);

// ─── Teya transaction sync (PR #24) — import_bank_data ─────────
export { getTeyaSyncStatus, getTeyaCoverage } from './teya-sync.handlers';
import { syncTeyaTransactions as _syncTeyaTransactions } from './teya-sync.handlers';
export const syncTeyaTransactions = withPermission('import_bank_data', _syncTeyaTransactions);

// ─── Reconciliation dashboard (PR #28) — read ──────────────────
export { getReconcileDashboard } from './reconcile-dashboard.handlers';

// ─── Generic import wizard (PR #33-#35) — manage_finance_settings ──
export { listImportFormats, listImportRuns } from './import-wizard.handlers';
import {
  parseImportFile as _parseImportFile,
  saveImportFormat as _saveImportFormat,
  deleteImportFormat as _deleteImportFormat,
  resolveEntities as _resolveEntities,
  saveEntityResolutions as _saveEntityResolutions,
  reviewRows as _reviewRows,
  commitImport as _commitImport,
} from './import-wizard.handlers';
export const parseImportFile        = withPermission('manage_finance_settings', _parseImportFile);
export const saveImportFormat       = withPermission('manage_finance_settings', _saveImportFormat);
export const deleteImportFormat     = withPermission('manage_finance_settings', _deleteImportFormat);
export const resolveEntities        = withPermission('manage_finance_settings', _resolveEntities);
export const saveEntityResolutions  = withPermission('manage_finance_settings', _saveEntityResolutions);
export const reviewRows             = withPermission('manage_finance_settings', _reviewRows);
export const commitImport           = withPermission('manage_finance_settings', _commitImport);

// ─── Finmap historical import (PR #30) — manage_finance_settings ─
export { getFinmapImportStatus } from './finmap-import.handlers';
import {
  importFinmap as _importFinmap,
  rollbackFinmapImport as _rollbackFinmapImport,
} from './finmap-import.handlers';
export const importFinmap         = withPermission('manage_finance_settings', _importFinmap);
export const rollbackFinmapImport = withPermission('manage_finance_settings', _rollbackFinmapImport);

// ─── Investor public portal (PR #32) — token-auth, no session ────
// Public endpoint — auth is the portal_token in URL. NOT wrapped with
// withPermission. Investor can revoke by regenerating token in admin.
export { getInvestorPortalData } from './investor-portal.handlers';

// ─── Supabase importer (PR #36) — manage_investors ──────────────
import { importFromSupabase as _importFromSupabase } from './supabase-import.handlers';
export const importFromSupabase = withPermission('manage_investors', _importFromSupabase);

// ─── Investor module (PR #31, expanded #38) — manage_investors permission ─────
export {
  listInvestors, listInvestments, listMonthlyMetrics, listPayouts, listInvestorProjects,
  listInvestorProperties, listMonthlyReports, getMonthlyDigest, getTelegramStatus,
  getAutoRevenueForMonth,
} from './investors.handlers';
export { getInvestorAudit, previewCascadeDelete } from './investor-audit.handlers';
export { listMonthlyNotes } from './investor-notes.handlers';
import {
  upsertMonthlyNote as _upsertMonthlyNote,
  deleteMonthlyNote as _deleteMonthlyNote,
} from './investor-notes.handlers';
export const upsertMonthlyNote = withPermission('manage_investors', _upsertMonthlyNote);
export const deleteMonthlyNote = withPermission('manage_investors', _deleteMonthlyNote);

export { listDocuments, downloadDocument } from './investor-documents.handlers';
import {
  uploadDocument as _uploadDocument,
  deleteDocument as _deleteDocument,
} from './investor-documents.handlers';
export const uploadDocument = withPermission('manage_investors', _uploadDocument);
export const deleteDocument = withPermission('manage_investors', _deleteDocument);

export { listForecastScenarios } from './forecast-scenarios.handlers';
import {
  upsertForecastScenario as _upsertForecastScenario,
  deleteForecastScenario as _deleteForecastScenario,
  copyScenariosToAll as _copyScenariosToAll,
} from './forecast-scenarios.handlers';
export const upsertForecastScenario = withPermission('manage_investors', _upsertForecastScenario);
export const deleteForecastScenario = withPermission('manage_investors', _deleteForecastScenario);
export const copyScenariosToAll     = withPermission('manage_investors', _copyScenariosToAll);
import {
  relinkProjectToUnit as _relinkProjectToUnit,
  executeCascadeDelete as _executeCascadeDelete,
} from './investor-audit.handlers';
export const relinkProjectToUnit = withPermission('manage_investors', _relinkProjectToUnit);
export const executeCascadeDelete = withPermission('manage_investors', _executeCascadeDelete);
import {
  createInvestor as _createInvestor, updateInvestor as _updateInvestor, deleteInvestor as _deleteInvestor,
  createInvestment as _createInvestment, updateInvestment as _updateInvestment, deleteInvestment as _deleteInvestment,
  upsertMonthlyMetric as _upsertMonthlyMetric, deleteMonthlyMetric as _deleteMonthlyMetric,
  createPayout as _createPayout, deletePayout as _deletePayout,
  previewMonthlyPayout as _previewMonthlyPayout, bulkMonthlyPayout as _bulkMonthlyPayout,
  createInvestorProperty as _createInvestorProperty, updateInvestorProperty as _updateInvestorProperty,
  unlinkInvestorProperty as _unlinkInvestorProperty,
  upsertMonthlyReport as _upsertMonthlyReport, deleteMonthlyReport as _deleteMonthlyReport,
  sendDigestTelegram as _sendDigestTelegram,
} from './investors.handlers';
export const createInvestor      = withPermission('manage_investors', _createInvestor);
export const updateInvestor      = withPermission('manage_investors', _updateInvestor);
export const deleteInvestor      = withPermission('manage_investors', _deleteInvestor);
export const createInvestment    = withPermission('manage_investors', _createInvestment);
export const updateInvestment    = withPermission('manage_investors', _updateInvestment);
export const deleteInvestment    = withPermission('manage_investors', _deleteInvestment);
export const upsertMonthlyMetric = withPermission('manage_investors', _upsertMonthlyMetric);
export const deleteMonthlyMetric = withPermission('manage_investors', _deleteMonthlyMetric);
export const createPayout        = withPermission('manage_investors', _createPayout);
export const deletePayout        = withPermission('manage_investors', _deletePayout);
export const previewMonthlyPayout = withPermission('manage_investors', _previewMonthlyPayout);
export const bulkMonthlyPayout    = withPermission('manage_investors', _bulkMonthlyPayout);
export const createInvestorProperty = withPermission('manage_investors', _createInvestorProperty);
export const updateInvestorProperty = withPermission('manage_investors', _updateInvestorProperty);
export const unlinkInvestorProperty = withPermission('manage_investors', _unlinkInvestorProperty);
export const upsertMonthlyReport    = withPermission('manage_investors', _upsertMonthlyReport);
export const deleteMonthlyReport    = withPermission('manage_investors', _deleteMonthlyReport);
export const sendDigestTelegram     = withPermission('manage_investors', _sendDigestTelegram);

// ─── Orphan payment recovery (PR #G) + paid services (PR #H) ──
export { listOrphanPayments, listPaidServices } from './payment-recovery.handlers';
import { restoreOrphanPayment as _restoreOrphanPayment } from './payment-recovery.handlers';
export const restoreOrphanPayment = withPermission('manage_payments', _restoreOrphanPayment);

// ─── Receipt inbox (PR #27) — import_bank_data + manage_payments ─
export { listReceiptInboxes, listPendingReceipts, downloadPendingReceipt } from './receipt-inbox.handlers';
import {
  createReceiptInbox as _createReceiptInbox,
  updateReceiptInbox as _updateReceiptInbox,
  deleteReceiptInbox as _deleteReceiptInbox,
  runReceiptInboxNow as _runReceiptInboxNow,
  attachPendingReceipt as _attachPendingReceipt,
  archivePendingReceipt as _archivePendingReceipt,
} from './receipt-inbox.handlers';
export const createReceiptInbox    = withPermission('import_bank_data', _createReceiptInbox);
export const updateReceiptInbox    = withPermission('import_bank_data', _updateReceiptInbox);
export const deleteReceiptInbox    = withPermission('import_bank_data', _deleteReceiptInbox);
export const runReceiptInboxNow    = withPermission('import_bank_data', _runReceiptInboxNow);
export const attachPendingReceipt  = withPermission('manage_payments', _attachPendingReceipt);
export const archivePendingReceipt = withPermission('manage_payments', _archivePendingReceipt);
