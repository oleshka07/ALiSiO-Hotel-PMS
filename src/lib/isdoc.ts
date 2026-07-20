/**
 * ALiSiO PMS — ISDOC v6.0.2 Generator
 *
 * Generates Czech electronic invoice (ISDOC) XML.
 * Kemp Carlsbad s.r.o. is a NON-VAT payer (neplátce DPH), so:
 *   - VATApplicable = false at document level
 *   - All line items have 0% VAT
 *   - TaxAmount = 0, TaxExclusiveAmount = TaxInclusiveAmount = PayableAmount
 *
 * Standard: ISDOC v6.0.2, namespace http://isdoc.cz/namespace/2013
 */

import crypto from 'crypto';

// ─── Supplier (hardcoded for Kemp Carlsbad s.r.o.) ───────────────────────────

const SUPPLIER = {
  ico:     '23430567',
  dic:     '',                         // neplátce DPH — no VAT number
  name:    'Kemp Carlsbad s.r.o.',
  street:  'Chebská 38/5',
  city:    'Dvory',
  zip:     '360 06',
  country: 'CZ',
  // Bank details — read from env or defaults to empty
  bankAccount: process.env.BANK_ACCOUNT || '',
  bankCode:    process.env.BANK_CODE    || '',
  bankName:    process.env.BANK_NAME    || '',
  iban:        process.env.BANK_IBAN    || '',
  bic:         process.env.BANK_BIC     || '',
};

// PaymentMeansCode: 10=cash, 42=bank transfer, 48=card
const PAYMENT_CODE: Record<string, string> = {
  cash:             '10',
  card:             '48',
  bank_transfer:    '42',
  online:           '48',
  booking_platform: '42',
  invoice:          '42',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IsdocBuyer {
  name: string;
  ico?: string;
  dic?: string;
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
}

export interface IsdocInput {
  /** Invoice number as stored in DB, e.g. "2026-001" */
  invoiceNumber: string;
  /** Issue date ISO "2026-05-09" */
  issueDate: string;
  /** Date of taxable supply (usually check-out or payment date) */
  taxPointDate?: string;
  /** Human-readable description for the line item */
  description: string;
  /**
   * Total amount (brutto = netto for neplátce DPH).
   * For credit notes (storno) this should be NEGATIVE.
   */
  amount: number;
  currency: string;
  /** Optional buyer — individual guests may omit IČO/DIČ */
  buyer?: IsdocBuyer;
  /** Payment method key from fin_operations.method */
  paymentMethod?: string;
  /** Due date ISO "2026-05-10" */
  paymentDueDate?: string;
  /** Note printed in the <Note> field */
  note?: string;
  /**
   * ISDOC DocumentType:
   *   1 = Faktura (regular invoice, default)
   *   2 = Opravný doklad / Storno (credit note)
   */
  documentType?: 1 | 2;
  /**
   * Reference to original document — REQUIRED by ISDOC schema when documentType=2.
   * Use the source_ref or original invoice number.
   */
  originalDocRef?: string;
  /**
   * Secondary foreign-currency reference (e.g. "Původní částka: 250,00 EUR ·
   * kurz 25,300 CZK/EUR"). When set, `amount`/`currency` are already the CZK
   * values and this note is appended to <Note> for the accountant.
   */
  foreignNote?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function uuid(): string {
  return crypto.randomUUID().toUpperCase();
}

// ─── Generator ───────────────────────────────────────────────────────────────

/**
 * Generate ISDOC v6.0.2 XML string for a single invoice.
 * For neplátce DPH: VAT = 0, all amounts are equal (excl = incl = payable).
 */
export function generateIsdocXml(input: IsdocInput): string {
  const {
    invoiceNumber,
    issueDate,
    taxPointDate = issueDate,
    description,
    amount,
    currency,
    buyer,
    paymentMethod,
    paymentDueDate = issueDate,
    note,
    documentType = 1,
    originalDocRef,
    foreignNote,
  } = input;

  const isCreditNote = documentType === 2;

  // ISDOC ID: strip dashes from invoice number → "2026001"
  const isdocId = invoiceNumber.replace(/-/g, '');
  // For credit notes amounts are negative — show absolute value in payment block
  const absAmount  = Math.abs(amount);
  const amountStr  = fmt(absAmount);   // PaymentMeans uses positive
  const signedStr  = fmt(amount);      // line item uses signed (negative)
  const payCode    = PAYMENT_CODE[paymentMethod || ''] || '42';

  // ─── Buyer party block ───────────────────────────────────────────
  const buyerBlock = buyer ? `
  <AccountingCustomerParty>
    <Party>
      <PartyIdentification>
        <ID>${esc(buyer.ico || '')}</ID>
      </PartyIdentification>
      <PartyName>
        <Name>${esc(buyer.name)}</Name>
      </PartyName>
      <PostalAddress>
        <StreetName>${esc(buyer.street || '')}</StreetName>
        <BuildingNumber/>
        <CityName>${esc(buyer.city || '')}</CityName>
        <PostalZone>${esc(buyer.zip || '')}</PostalZone>
        <Country>
          <IdentificationCode>${esc(buyer.country || '')}</IdentificationCode>
          <Name/>
        </Country>
      </PostalAddress>${buyer.dic ? `
      <PartyTaxScheme>
        <CompanyID>${esc(buyer.dic)}</CompanyID>
        <TaxScheme>VAT</TaxScheme>
      </PartyTaxScheme>` : ''}
      <Contact/>
    </Party>
  </AccountingCustomerParty>` : `
  <AccountingCustomerParty>
    <Party>
      <PartyIdentification><ID/></PartyIdentification>
      <PartyName><Name/></PartyName>
      <PostalAddress>
        <StreetName/><BuildingNumber/><CityName/>
        <PostalZone/>
        <Country><IdentificationCode/><Name/></Country>
      </PostalAddress>
      <Contact/>
    </Party>
  </AccountingCustomerParty>`;

  // ─── Payment means block ─────────────────────────────────────────
  const hasBankDetails = SUPPLIER.iban || SUPPLIER.bankAccount;
  const paymentBlock = `
  <PaymentMeans>
    <Payment>
      <PaidAmount>${amountStr}</PaidAmount>
      <PaymentMeansCode>${payCode}</PaymentMeansCode>
      <Details>
        <PaymentDueDate>${paymentDueDate}</PaymentDueDate>
        <ID>${esc(SUPPLIER.bankAccount)}</ID>
        <BankCode>${esc(SUPPLIER.bankCode)}</BankCode>
        <Name>${esc(SUPPLIER.bankName)}</Name>${hasBankDetails ? `
        <IBAN>${esc(SUPPLIER.iban)}</IBAN>
        <BIC>${esc(SUPPLIER.bic)}</BIC>` : ''}
        <VariableSymbol>${esc(isdocId)}</VariableSymbol>
        <ConstantSymbol>0308</ConstantSymbol>
      </Details>
    </Payment>
  </PaymentMeans>`;

  // ─── OriginalDocumentReference block (required for credit notes) ─────────
  const originalDocBlock = isCreditNote && originalDocRef ? `
  <OriginalDocumentReference>
    <ID>${esc(originalDocRef)}</ID>
  </OriginalDocumentReference>` : '';

  // ─── Full XML ────────────────────────────────────────────────
  const baseNote = isCreditNote
    ? (note || `Storno platby – vrácení: ${description}`)
    : (note || `Fakturujeme Vám: ${description}`);
  const noteText = foreignNote ? `${baseNote} | ${foreignNote}` : baseNote;

  return `<?xml version="1.0" encoding="utf-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">
  <DocumentType>${documentType}</DocumentType>
  <ID>${esc(isdocId)}</ID>
  <UUID>${uuid()}</UUID>
  <IssuingSystem>ALiSiO PMS</IssuingSystem>
  <IssueDate>${issueDate}</IssueDate>
  <TaxPointDate>${taxPointDate}</TaxPointDate>
  <VATApplicable>false</VATApplicable>
  <ElectronicPossibilityAgreementReference/>${originalDocBlock}
  <Note>${esc(noteText)}</Note>
  <LocalCurrencyCode>${esc(currency)}</LocalCurrencyCode>
  <CurrRate>1</CurrRate>
  <RefCurrRate>1</RefCurrRate>
  <AccountingSupplierParty>
    <Party>
      <PartyIdentification>
        <ID>${esc(SUPPLIER.ico)}</ID>
      </PartyIdentification>
      <PartyName>
        <Name>${esc(SUPPLIER.name)}</Name>
      </PartyName>
      <PostalAddress>
        <StreetName>${esc(SUPPLIER.street)}</StreetName>
        <BuildingNumber/>
        <CityName>${esc(SUPPLIER.city)}</CityName>
        <PostalZone>${esc(SUPPLIER.zip)}</PostalZone>
        <Country>
          <IdentificationCode>${esc(SUPPLIER.country)}</IdentificationCode>
          <Name>Česká republika</Name>
        </Country>
      </PostalAddress>
      <PartyTaxScheme>
        <CompanyID/>
        <TaxScheme>VAT</TaxScheme>
      </PartyTaxScheme>
      <RegisterIdentification>
        <Preformatted/>
      </RegisterIdentification>
      <Contact/>
    </Party>
  </AccountingSupplierParty>${buyerBlock}
  <InvoiceLines>
    <InvoiceLine>
      <ID>${uuid()}</ID>
      <InvoicedQuantity>1</InvoicedQuantity>
      <LineExtensionAmount>${signedStr}</LineExtensionAmount>
      <LineExtensionAmountTaxInclusive>${signedStr}</LineExtensionAmountTaxInclusive>
      <LineExtensionTaxAmount>0.00</LineExtensionTaxAmount>
      <UnitPrice>${signedStr}</UnitPrice>
      <UnitPriceTaxInclusive>${signedStr}</UnitPriceTaxInclusive>
      <ClassifiedTaxCategory>
        <Percent>0</Percent>
        <VATCalculationMethod>0</VATCalculationMethod>
        <VATApplicable>false</VATApplicable>
      </ClassifiedTaxCategory>
      <Item>
        <Description>${esc(description)}</Description>
      </Item>
    </InvoiceLine>
  </InvoiceLines>
  <TaxTotal>
    <TaxSubTotal>
      <TaxableAmount>${signedStr}</TaxableAmount>
      <TaxAmount>0.00</TaxAmount>
      <TaxInclusiveAmount>${signedStr}</TaxInclusiveAmount>
      <AlreadyClaimedTaxableAmount>0.00</AlreadyClaimedTaxableAmount>
      <AlreadyClaimedTaxAmount>0.00</AlreadyClaimedTaxAmount>
      <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
      <DifferenceTaxableAmount>${signedStr}</DifferenceTaxableAmount>
      <DifferenceTaxAmount>0.00</DifferenceTaxAmount>
      <DifferenceTaxInclusiveAmount>${signedStr}</DifferenceTaxInclusiveAmount>
      <TaxCategory>
        <Percent>0</Percent>
        <VATApplicable>false</VATApplicable>
        <LocalReverseChargeFlag>false</LocalReverseChargeFlag>
      </TaxCategory>
    </TaxSubTotal>
    <TaxAmount>0.00</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>${signedStr}</TaxExclusiveAmount>
    <TaxInclusiveAmount>${signedStr}</TaxInclusiveAmount>
    <AlreadyClaimedTaxExclusiveAmount>0.00</AlreadyClaimedTaxExclusiveAmount>
    <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
    <DifferenceTaxExclusiveAmount>${amountStr}</DifferenceTaxExclusiveAmount>
    <DifferenceTaxInclusiveAmount>${amountStr}</DifferenceTaxInclusiveAmount>
    <PayableRoundingAmount>0.00</PayableRoundingAmount>
    <PaidDepositsAmount>0.00</PaidDepositsAmount>
    <PayableAmount>${amountStr}</PayableAmount>
  </LegalMonetaryTotal>${paymentBlock}
</Invoice>
`;
}
