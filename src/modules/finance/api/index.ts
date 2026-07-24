// ════════════════════════════════════════════════════════════
// Finance module — public API surface
//
// ACCESS POLICY (single source of truth: ./_guard.ts → isFinanceAuthorized):
//   The entire finance module is OWNER-ONLY. Every session-based endpoint —
//   reads AND writes — is wrapped so that only the owner (or an explicit
//   FINANCE_EXTRA_USER_IDS allow-list entry) can reach it. The edge middleware
//   only checks cookie presence; real session validation happens in the guard.
//
//   - withFinanceRead(...)   → all reads (session + owner)
//   - withPermission(...)    → all writes (session + owner + feature permission)
//
// NOT wrapped (own auth / no user session):
//   - payment-bridge (createPaymentOperation, hasPaymentOperation,
//     deletePaymentOperationsForReservation) — internal, called programmatically
//   - generateInvoiceForReservation / reissueInvoiceForReservation — internal,
//     called from bookings + payments on reservation lifecycle
//   - getReservationPaymentTotals / recalcReservationPaymentStatus — internal
//     (db, reservationId) helpers
//   - telegram-bridge handlers — Bearer TELEGRAM_BRIDGE_TOKEN auth
//   - pollBankInboxesFromCron — X-Cron-Secret auth
//   - getInvestorPortalData — investor portal token auth
// ════════════════════════════════════════════════════════════

import { withPermission, withFinanceRead } from './_guard';

// ─── Finance step-up passphrase (security) — self-guarded, owner-only ─────────
// These must stay reachable while finance is locked, so they are NOT wrapped
// with withFinanceRead/withPermission (which require an unlocked session).
export {
  getFinanceSecurityStatus, setupFinancePassphrase,
  unlockFinanceHandler, lockFinanceHandler,
} from './security.handlers';

// ─── Reports & matrices (read) ────────────────────────────────
import {
  getFinanceOverview as _getFinanceOverview, getPnl as _getPnl, getCashflow as _getCashflow,
  getExpectedPayments as _getExpectedPayments, getCashflowMatrix as _getCashflowMatrix,
  getPnlMatrix as _getPnlMatrix, getFinancialIndicators as _getFinancialIndicators,
  getOperationsForDrillDown as _getOperationsForDrillDown, getBalanceSheet as _getBalanceSheet,
  getProjectProfitability as _getProjectProfitability, getAccountStatement as _getAccountStatement,
  getPlanFactReport as _getPlanFactReport,
} from './reports.handlers';
export const getFinanceOverview      = withFinanceRead(_getFinanceOverview);
export const getPnl                  = withFinanceRead(_getPnl);
export const getCashflow             = withFinanceRead(_getCashflow);
export const getExpectedPayments     = withFinanceRead(_getExpectedPayments);
export const getCashflowMatrix       = withFinanceRead(_getCashflowMatrix);
export const getPnlMatrix            = withFinanceRead(_getPnlMatrix);
export const getFinancialIndicators  = withFinanceRead(_getFinancialIndicators);
export const getOperationsForDrillDown = withFinanceRead(_getOperationsForDrillDown);
export const getBalanceSheet         = withFinanceRead(_getBalanceSheet);
export const getProjectProfitability = withFinanceRead(_getProjectProfitability);
export const getAccountStatement     = withFinanceRead(_getAccountStatement);
export const getPlanFactReport       = withFinanceRead(_getPlanFactReport);

// ─── Budgets ──────────────────────────────────────────────────
import {
  listBudgets as _listBudgets,
  upsertBudget as _upsertBudget, deleteBudget as _deleteBudget,
} from './budgets.handlers';
export const listBudgets  = withFinanceRead(_listBudgets);
export const upsertBudget = withPermission('manage_finance_settings', _upsertBudget);
export const deleteBudget = withPermission('manage_finance_settings', _deleteBudget);

// ─── Expense categories (legacy compat) ───────────────────────
import {
  listExpenseCategories as _listExpenseCategories,
  createExpenseCategory as _createExpenseCategory,
} from './expense-categories.handlers';
export const listExpenseCategories = withFinanceRead(_listExpenseCategories);
export const createExpenseCategory = withPermission('manage_finance_settings', _createExpenseCategory);

// ─── Categories (PR #2) ───────────────────────────────────────
import {
  listCategories as _listCategories, getCategoryTree as _getCategoryTree,
  createCategory as _createCategory, updateCategory as _updateCategory,
  archiveCategory as _archiveCategory, deleteCategory as _deleteCategory,
  moveCategory as _moveCategory,
} from './categories.handlers';
export const listCategories  = withFinanceRead(_listCategories);
export const getCategoryTree = withFinanceRead(_getCategoryTree);
export const createCategory  = withPermission('manage_finance_settings', _createCategory);
export const updateCategory  = withPermission('manage_finance_settings', _updateCategory);
export const archiveCategory = withPermission('manage_finance_settings', _archiveCategory);
export const deleteCategory  = withPermission('manage_finance_settings', _deleteCategory);
export const moveCategory    = withPermission('manage_finance_settings', _moveCategory);

// ─── Business units (legacy read) ─────────────────────────────
import { listBusinessUnits as _listBusinessUnits } from './business-units.handlers';
export const listBusinessUnits = withFinanceRead(_listBusinessUnits);

// ─── Projects (PR #3) ─────────────────────────────────────────
import {
  listProjects as _listProjects, getProjectTree as _getProjectTree,
  createProject as _createProject, updateProject as _updateProject,
  archiveProject as _archiveProject, deleteProject as _deleteProject,
  moveProject as _moveProject,
} from './projects.handlers';
export const listProjects   = withFinanceRead(_listProjects);
export const getProjectTree = withFinanceRead(_getProjectTree);
export const createProject  = withPermission('manage_finance_settings', _createProject);
export const updateProject  = withPermission('manage_finance_settings', _updateProject);
export const archiveProject = withPermission('manage_finance_settings', _archiveProject);
export const deleteProject  = withPermission('manage_finance_settings', _deleteProject);
export const moveProject    = withPermission('manage_finance_settings', _moveProject);

// ─── Counterparties (PR #4) ───────────────────────────────────
import {
  listCounterparties as _listCounterparties, getCounterpartyTree as _getCounterpartyTree,
  matchCounterpartyByText as _matchCounterpartyByText, getAliasSuggestions as _getAliasSuggestions,
  createCounterparty as _createCounterparty, updateCounterparty as _updateCounterparty,
  archiveCounterparty as _archiveCounterparty, deleteCounterparty as _deleteCounterparty,
  moveCounterparty as _moveCounterparty,
} from './counterparties.handlers';
export const listCounterparties      = withFinanceRead(_listCounterparties);
export const getCounterpartyTree     = withFinanceRead(_getCounterpartyTree);
export const matchCounterpartyByText = withFinanceRead(_matchCounterpartyByText);
export const getAliasSuggestions     = withFinanceRead(_getAliasSuggestions);
export const createCounterparty  = withPermission('manage_finance_settings', _createCounterparty);
export const updateCounterparty  = withPermission('manage_finance_settings', _updateCounterparty);
export const archiveCounterparty = withPermission('manage_finance_settings', _archiveCounterparty);
export const deleteCounterparty  = withPermission('manage_finance_settings', _deleteCounterparty);
export const moveCounterparty    = withPermission('manage_finance_settings', _moveCounterparty);

// ─── Tags (PR #5) ─────────────────────────────────────────────
import {
  listTags as _listTags,
  createTag as _createTag, updateTag as _updateTag,
  archiveTag as _archiveTag, deleteTag as _deleteTag,
} from './tags.handlers';
export const listTags   = withFinanceRead(_listTags);
export const createTag  = withPermission('manage_finance_settings', _createTag);
export const updateTag  = withPermission('manage_finance_settings', _updateTag);
export const archiveTag = withPermission('manage_finance_settings', _archiveTag);
export const deleteTag  = withPermission('manage_finance_settings', _deleteTag);

// ─── CapEx (legacy) ───────────────────────────────────────────
import { listCapex as _listCapex, createCapex as _createCapex } from './capex.handlers';
import {
  getCapexItem as _getCapexItem,
  updateCapexItem as _updateCapexItem, deleteCapexItem as _deleteCapexItem,
} from './capex-item.handlers';
export const listCapex       = withFinanceRead(_listCapex);
export const getCapexItem    = withFinanceRead(_getCapexItem);
export const createCapex     = withPermission('manage_finance_settings', _createCapex);
export const updateCapexItem = withPermission('manage_finance_settings', _updateCapexItem);
export const deleteCapexItem = withPermission('manage_finance_settings', _deleteCapexItem);

// ─── Accruals (legacy) ────────────────────────────────────────
import { listAccruals as _listAccruals, createAccrual as _createAccrual } from './accruals.handlers';
import {
  getAccrual as _getAccrual,
  updateAccrual as _updateAccrual, deleteAccrual as _deleteAccrual,
} from './accrual.handlers';
export const listAccruals  = withFinanceRead(_listAccruals);
export const getAccrual    = withFinanceRead(_getAccrual);
export const createAccrual = withPermission('manage_finance_settings', _createAccrual);
export const updateAccrual = withPermission('manage_finance_settings', _updateAccrual);
export const deleteAccrual = withPermission('manage_finance_settings', _deleteAccrual);

// ─── Bank statements (manual import + transaction edit) ───────
import {
  listBankStatements as _listBankStatements, listBankTransactions as _listBankTransactions,
  updateBankTransaction as _updateBankTransaction, importBankStatement as _importBankStatement,
} from './bank.handlers';
export const listBankStatements    = withFinanceRead(_listBankStatements);
export const listBankTransactions  = withFinanceRead(_listBankTransactions);
export const updateBankTransaction = withPermission('import_bank_data', _updateBankTransaction);
export const importBankStatement   = withPermission('import_bank_data', _importBankStatement);

// ─── Invoices ─────────────────────────────────────────────────
// generateInvoiceForReservation / reissueInvoiceForReservation are internal
// (called from bookings + payments on reservation lifecycle) — NOT guarded.
export {
  generateInvoiceForReservation, reissueInvoiceForReservation,
} from './invoices.handlers';
import {
  listInvoices as _listInvoices, getInvoiceHtml as _getInvoiceHtml,
  getInvoiceByReservation as _getInvoiceByReservation,
  reissueInvoiceHandler as _reissueInvoiceHandler,
} from './invoices.handlers';
export const listInvoices            = withFinanceRead(_listInvoices);
export const getInvoiceHtml          = withFinanceRead(_getInvoiceHtml);
export const getInvoiceByReservation = withFinanceRead(_getInvoiceByReservation);
export const reissueInvoiceHandler   = withPermission('manage_finance_settings', _reissueInvoiceHandler);

// ─── Invoice Reconciliation Journal ───────────────────────────
import { reconciliationHandler as _reconciliationHandler } from './reconciliation.handlers';
export const reconciliationHandler = withFinanceRead(_reconciliationHandler);

// ─── Accounts (PR #1) ─────────────────────────────────────────
import {
  listAccounts as _listAccounts,
  createAccount as _createAccount, updateAccount as _updateAccount,
  archiveAccount as _archiveAccount, deleteAccount as _deleteAccount,
  reconcileAccount as _reconcileAccount,
} from './accounts.handlers';
export const listAccounts     = withFinanceRead(_listAccounts);
export const createAccount    = withPermission('manage_finance_settings', _createAccount);
export const updateAccount    = withPermission('manage_finance_settings', _updateAccount);
export const archiveAccount   = withPermission('manage_finance_settings', _archiveAccount);
export const deleteAccount    = withPermission('manage_finance_settings', _deleteAccount);
export const reconcileAccount = withPermission('manage_finance_settings', _reconcileAccount);

// ─── Exchange rates (PR #1) ───────────────────────────────────
import {
  listExchangeRates as _listExchangeRates, getCurrentRate as _getCurrentRate,
  upsertExchangeRate as _upsertExchangeRate, deleteExchangeRate as _deleteExchangeRate,
} from './exchange-rates.handlers';
export const listExchangeRates  = withFinanceRead(_listExchangeRates);
export const getCurrentRate     = withFinanceRead(_getCurrentRate);
export const upsertExchangeRate = withPermission('manage_finance_settings', _upsertExchangeRate);
export const deleteExchangeRate = withPermission('manage_finance_settings', _deleteExchangeRate);

// ─── Audit log ────────────────────────────────────────────────
import { getFinanceLog as _getFinanceLog } from './log.handlers';
export const getFinanceLog = withFinanceRead(_getFinanceLog);

// ─── Read-only finance audit (hidden /finance/audit page) ─────
import { getFinanceAudit as _getFinanceAudit } from './audit.handlers';
export const getFinanceAudit = withFinanceRead(_getFinanceAudit);

// ─── Operations (PR #6) — manage_payments ─────────────────────
// getReservationPaymentTotals / recalcReservationPaymentStatus are internal
// (db, reservationId) helpers used by other handlers — NOT guarded.
export {
  getReservationPaymentTotals, recalcReservationPaymentStatus,
} from './operations.handlers';
import {
  listOperations as _listOperations, getOperation as _getOperation,
  getOperationAudit as _getOperationAudit,
  createOperation as _createOperation, updateOperation as _updateOperation,
  deleteOperation as _deleteOperation, duplicateOperation as _duplicateOperation,
  mergeOperations as _mergeOperations,
  applyRecurringSuggestion as _applyRecurringSuggestion,
} from './operations.handlers';
export const listOperations    = withFinanceRead(_listOperations);
export const getOperation      = withFinanceRead(_getOperation);
export const getOperationAudit = withFinanceRead(_getOperationAudit);
export const createOperation    = withPermission('manage_payments', _createOperation);
export const updateOperation    = withPermission('manage_payments', _updateOperation);
export const deleteOperation    = withPermission('manage_payments', _deleteOperation);
export const mergeOperations    = withPermission('manage_payments', _mergeOperations);
export const duplicateOperation = withPermission('manage_payments', _duplicateOperation);
export const applyRecurringSuggestion = withPermission('manage_payments', _applyRecurringSuggestion);

// ─── Payment bridge — INTERNAL (no HTTP, no guard) ────────────
export {
  createPaymentOperation, hasPaymentOperation, deletePaymentOperationsForReservation,
} from './payment-bridge';

// ─── Auto-rules (PR #7) ───────────────────────────────────────
import {
  listAutoRules as _listAutoRules,
  createAutoRule as _createAutoRule, updateAutoRule as _updateAutoRule,
  deleteAutoRule as _deleteAutoRule, toggleAutoRule as _toggleAutoRule,
  moveAutoRule as _moveAutoRule,
  applyAutoRulesToOperations as _applyAutoRulesToOperations,
  autoMatchCounterpartiesAllOps as _autoMatchCounterpartiesAllOps,
} from './auto-rules.handlers';
export const listAutoRules = withFinanceRead(_listAutoRules);
export const createAutoRule = withPermission('manage_finance_settings', _createAutoRule);
export const updateAutoRule = withPermission('manage_finance_settings', _updateAutoRule);
export const deleteAutoRule = withPermission('manage_finance_settings', _deleteAutoRule);
export const toggleAutoRule = withPermission('manage_finance_settings', _toggleAutoRule);
export const moveAutoRule   = withPermission('manage_finance_settings', _moveAutoRule);
export const applyAutoRulesToOperations    = withPermission('manage_finance_settings', _applyAutoRulesToOperations);
export const autoMatchCounterpartiesAllOps = withPermission('manage_finance_settings', _autoMatchCounterpartiesAllOps);

// ─── Recurring templates + calendar (PR #8) ───────────────────
import {
  listRecurringTemplates as _listRecurringTemplates,
  createRecurringTemplate as _createRecurringTemplate,
  updateRecurringTemplate as _updateRecurringTemplate,
  deleteRecurringTemplate as _deleteRecurringTemplate,
  toggleRecurringTemplate as _toggleRecurringTemplate,
  runRecurringNow as _runRecurringNow,
  runAllDue as _runAllDue,
} from './recurring.handlers';
export const listRecurringTemplates  = withFinanceRead(_listRecurringTemplates);
export const createRecurringTemplate = withPermission('manage_finance_settings', _createRecurringTemplate);
export const updateRecurringTemplate = withPermission('manage_finance_settings', _updateRecurringTemplate);
export const deleteRecurringTemplate = withPermission('manage_finance_settings', _deleteRecurringTemplate);
export const toggleRecurringTemplate = withPermission('manage_finance_settings', _toggleRecurringTemplate);
export const runRecurringNow         = withPermission('manage_finance_settings', _runRecurringNow);
export const runAllDue               = withPermission('manage_finance_settings', _runAllDue);

import { getCalendarMonth as _getCalendarMonth } from './calendar.handlers';
export const getCalendarMonth = withFinanceRead(_getCalendarMonth);

// ─── Bank inbox (PR #11) — import_bank_data ───────────────────
import {
  listBankInboxes as _listBankInboxes,
  createBankInbox as _createBankInbox, updateBankInbox as _updateBankInbox,
  deleteBankInbox as _deleteBankInbox, toggleBankInbox as _toggleBankInbox,
  testBankInbox as _testBankInbox, runBankInboxNow as _runBankInboxNow,
  runAllInboxes as _runAllInboxes,
} from './bank-inbox.handlers';
export const listBankInboxes = withFinanceRead(_listBankInboxes);
export const createBankInbox = withPermission('import_bank_data', _createBankInbox);
export const updateBankInbox = withPermission('import_bank_data', _updateBankInbox);
export const deleteBankInbox = withPermission('import_bank_data', _deleteBankInbox);
export const toggleBankInbox = withPermission('import_bank_data', _toggleBankInbox);
export const testBankInbox   = withPermission('import_bank_data', _testBankInbox);
export const runBankInboxNow = withPermission('import_bank_data', _runBankInboxNow);
export const runAllInboxes   = withPermission('import_bank_data', _runAllInboxes);

// ─── Cron-driven bank inbox poll ──────────────────────────────
// X-Cron-Secret auth — NOT a user session.
export { pollBankInboxesFromCron } from './cron-bank-inbox.handlers';

// ─── Exports (PR #12) — read ──────────────────────────────────
import {
  exportOperations as _exportOperations, exportCashflow as _exportCashflow,
  exportPnl as _exportPnl, exportStatement as _exportStatement,
} from './export.handlers';
export const exportOperations = withFinanceRead(_exportOperations);
export const exportCashflow    = withFinanceRead(_exportCashflow);
export const exportPnl         = withFinanceRead(_exportPnl);
export const exportStatement   = withFinanceRead(_exportStatement);

// ─── Clearing accounts (PR #15) — read + manage_finance_settings ─
import {
  listClearingAccounts as _listClearingAccounts, listReceivables as _listReceivables,
  backfillReceivablesHandler as _backfillReceivablesHandler,
} from './clearing.handlers';
export const listClearingAccounts = withFinanceRead(_listClearingAccounts);
export const listReceivables      = withFinanceRead(_listReceivables);
export const backfillReceivablesHandler = withPermission('manage_finance_settings', _backfillReceivablesHandler);

// ─── Statement uploads (PR #16) — import_bank_data ─────────────
import {
  listStatementUploads as _listStatementUploads,
  uploadStatement as _uploadStatement,
} from './statement-upload.handlers';
export const listStatementUploads = withFinanceRead(_listStatementUploads);
export const uploadStatement      = withPermission('import_bank_data', _uploadStatement);

// ─── Telegram bridge (PR #17) — Bearer token auth, no session ──
export {
  recordTelegramOperation, listTelegramOperations, listTelegramCategories,
  listTelegramServices, listTelegramReservations, createTelegramServiceOrder,
} from './telegram-bridge.handlers';

// ─── Attachments (PR #23) — read + manage_payments for write ──
import {
  listOperationAttachments as _listOperationAttachments,
  downloadAttachment as _downloadAttachment, getAttachmentCounts as _getAttachmentCounts,
  uploadAttachment as _uploadAttachment, deleteAttachment as _deleteAttachment,
} from './attachments.handlers';
export const listOperationAttachments = withFinanceRead(_listOperationAttachments);
export const downloadAttachment       = withFinanceRead(_downloadAttachment);
export const getAttachmentCounts      = withFinanceRead(_getAttachmentCounts);
export const uploadAttachment = withPermission('manage_payments', _uploadAttachment);
export const deleteAttachment = withPermission('manage_payments', _deleteAttachment);

// ─── Teya transaction sync (PR #24) — import_bank_data ─────────
import {
  getTeyaSyncStatus as _getTeyaSyncStatus, getTeyaCoverage as _getTeyaCoverage,
  syncTeyaTransactions as _syncTeyaTransactions, importTeyaCsv as _importTeyaCsv,
} from './teya-sync.handlers';
export const getTeyaSyncStatus = withFinanceRead(_getTeyaSyncStatus);
export const getTeyaCoverage   = withFinanceRead(_getTeyaCoverage);
export const syncTeyaTransactions = withPermission('import_bank_data', _syncTeyaTransactions);
export const importTeyaCsv = withPermission('import_bank_data', _importTeyaCsv);

// ─── Reconciliation dashboard (PR #28) — read ──────────────────
import { getReconcileDashboard as _getReconcileDashboard } from './reconcile-dashboard.handlers';
export const getReconcileDashboard = withFinanceRead(_getReconcileDashboard);

// ─── Generic import wizard (PR #33-#35) — manage_finance_settings ──
import {
  listImportFormats as _listImportFormats, listImportRuns as _listImportRuns,
  parseImportFile as _parseImportFile, saveImportFormat as _saveImportFormat,
  deleteImportFormat as _deleteImportFormat, resolveEntities as _resolveEntities,
  saveEntityResolutions as _saveEntityResolutions, reviewRows as _reviewRows,
  commitImport as _commitImport,
} from './import-wizard.handlers';
export const listImportFormats = withFinanceRead(_listImportFormats);
export const listImportRuns    = withFinanceRead(_listImportRuns);
export const parseImportFile        = withPermission('manage_finance_settings', _parseImportFile);
export const saveImportFormat       = withPermission('manage_finance_settings', _saveImportFormat);
export const deleteImportFormat     = withPermission('manage_finance_settings', _deleteImportFormat);
export const resolveEntities        = withPermission('manage_finance_settings', _resolveEntities);
export const saveEntityResolutions  = withPermission('manage_finance_settings', _saveEntityResolutions);
export const reviewRows             = withPermission('manage_finance_settings', _reviewRows);
export const commitImport           = withPermission('manage_finance_settings', _commitImport);

// ─── Investor public portal (PR #32) — portal token auth, no session ─
export { getInvestorPortalData } from './investor-portal.handlers';

// ─── Supabase importer (PR #36) — manage_investors ──────────────
import { importFromSupabase as _importFromSupabase } from './supabase-import.handlers';
export const importFromSupabase = withPermission('manage_investors', _importFromSupabase);

// ─── Investor module (PR #31, expanded #38) — manage_investors ──
import {
  listInvestors as _listInvestors, listInvestments as _listInvestments,
  listMonthlyMetrics as _listMonthlyMetrics, listPayouts as _listPayouts,
  listInvestorProjects as _listInvestorProjects, listInvestorProperties as _listInvestorProperties,
  listMonthlyReports as _listMonthlyReports, getMonthlyDigest as _getMonthlyDigest,
  getTelegramStatus as _getTelegramStatus, getAutoRevenueForMonth as _getAutoRevenueForMonth,
} from './investors.handlers';
export const listInvestors          = withFinanceRead(_listInvestors);
export const listInvestments        = withFinanceRead(_listInvestments);
export const listMonthlyMetrics     = withFinanceRead(_listMonthlyMetrics);
export const listPayouts            = withFinanceRead(_listPayouts);
export const listInvestorProjects   = withFinanceRead(_listInvestorProjects);
export const listInvestorProperties = withFinanceRead(_listInvestorProperties);
export const listMonthlyReports     = withFinanceRead(_listMonthlyReports);
export const getMonthlyDigest       = withFinanceRead(_getMonthlyDigest);
export const getTelegramStatus      = withFinanceRead(_getTelegramStatus);
export const getAutoRevenueForMonth = withFinanceRead(_getAutoRevenueForMonth);

import { autoFillMetricsHandler as _autoFillMetricsHandler } from './investors.handlers';
export const autoFillMetricsHandler = withPermission('manage_investors', _autoFillMetricsHandler);

import {
  getInvestorAudit as _getInvestorAudit, previewCascadeDelete as _previewCascadeDelete,
  relinkProjectToUnit as _relinkProjectToUnit, executeCascadeDelete as _executeCascadeDelete,
} from './investor-audit.handlers';
export const getInvestorAudit     = withFinanceRead(_getInvestorAudit);
export const previewCascadeDelete = withFinanceRead(_previewCascadeDelete);
export const relinkProjectToUnit  = withPermission('manage_investors', _relinkProjectToUnit);
export const executeCascadeDelete = withPermission('manage_investors', _executeCascadeDelete);

import {
  listMonthlyNotes as _listMonthlyNotes,
  upsertMonthlyNote as _upsertMonthlyNote, deleteMonthlyNote as _deleteMonthlyNote,
} from './investor-notes.handlers';
export const listMonthlyNotes  = withFinanceRead(_listMonthlyNotes);
export const upsertMonthlyNote = withPermission('manage_investors', _upsertMonthlyNote);
export const deleteMonthlyNote = withPermission('manage_investors', _deleteMonthlyNote);

import {
  listDocuments as _listDocuments, downloadDocument as _downloadDocument,
  uploadDocument as _uploadDocument, deleteDocument as _deleteDocument,
} from './investor-documents.handlers';
export const listDocuments    = withFinanceRead(_listDocuments);
export const downloadDocument = withFinanceRead(_downloadDocument);
export const uploadDocument   = withPermission('manage_investors', _uploadDocument);
export const deleteDocument   = withPermission('manage_investors', _deleteDocument);

import {
  listForecastScenarios as _listForecastScenarios,
  upsertForecastScenario as _upsertForecastScenario,
  deleteForecastScenario as _deleteForecastScenario,
  copyScenariosToAll as _copyScenariosToAll,
} from './forecast-scenarios.handlers';
export const listForecastScenarios  = withFinanceRead(_listForecastScenarios);
export const upsertForecastScenario = withPermission('manage_investors', _upsertForecastScenario);
export const deleteForecastScenario = withPermission('manage_investors', _deleteForecastScenario);
export const copyScenariosToAll     = withPermission('manage_investors', _copyScenariosToAll);

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
import {
  listOrphanPayments as _listOrphanPayments, listPaidServices as _listPaidServices,
  restoreOrphanPayment as _restoreOrphanPayment,
} from './payment-recovery.handlers';
export const listOrphanPayments = withFinanceRead(_listOrphanPayments);
export const listPaidServices   = withFinanceRead(_listPaidServices);
export const restoreOrphanPayment = withPermission('manage_payments', _restoreOrphanPayment);

// ─── Receipt inbox (PR #27) — import_bank_data + manage_payments ─
import {
  listReceiptInboxes as _listReceiptInboxes, listPendingReceipts as _listPendingReceipts,
  downloadPendingReceipt as _downloadPendingReceipt,
  createReceiptInbox as _createReceiptInbox, updateReceiptInbox as _updateReceiptInbox,
  deleteReceiptInbox as _deleteReceiptInbox, runReceiptInboxNow as _runReceiptInboxNow,
  attachPendingReceipt as _attachPendingReceipt, archivePendingReceipt as _archivePendingReceipt,
} from './receipt-inbox.handlers';
export const listReceiptInboxes    = withFinanceRead(_listReceiptInboxes);
export const listPendingReceipts   = withFinanceRead(_listPendingReceipts);
export const downloadPendingReceipt = withFinanceRead(_downloadPendingReceipt);
export const createReceiptInbox    = withPermission('import_bank_data', _createReceiptInbox);
export const updateReceiptInbox    = withPermission('import_bank_data', _updateReceiptInbox);
export const deleteReceiptInbox    = withPermission('import_bank_data', _deleteReceiptInbox);
export const runReceiptInboxNow    = withPermission('import_bank_data', _runReceiptInboxNow);
export const attachPendingReceipt  = withPermission('manage_payments', _attachPendingReceipt);
export const archivePendingReceipt = withPermission('manage_payments', _archivePendingReceipt);

// ─── Finance user access (owner-only management + self-read) ──
import {
  listFinanceAccess as _listFinanceAccess,
  upsertFinanceAccess as _upsertFinanceAccess,
  deleteFinanceAccess as _deleteFinanceAccess,
  getMyFinanceAccess as _getMyFinanceAccess,
} from './finance-access.handlers';
export const listFinanceAccess    = withPermission('manage_users', _listFinanceAccess);
export const upsertFinanceAccess  = withPermission('manage_users', _upsertFinanceAccess);
export const deleteFinanceAccess  = withPermission('manage_users', _deleteFinanceAccess);
export const getMyFinanceAccess   = withFinanceRead(_getMyFinanceAccess);

// Re-export auth helpers for use in _guard.ts and other modules
export { isFinanceUserEnabled, getFinanceAccessForUser } from './finance-access.handlers';
