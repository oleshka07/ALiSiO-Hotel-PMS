import React from 'react';
import { Shield, FileText, Clock, RefreshCw, Trash2, Mail } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        
        {/* Header */}
        <div className="bg-indigo-600 px-8 py-10 text-white">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-indigo-200" />
            <h1 className="text-3xl font-bold m-0">Zásady ochrany osobních údajů</h1>
          </div>
          <p className="text-indigo-100 m-0 text-lg">
            Informace o zpracování osobních údajů hostů (GDPR)
          </p>
        </div>

        {/* Content */}
        <div className="p-8 prose prose-slate dark:prose-invert max-w-none">
          
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-indigo-500" />
              1. Správce osobních údajů
            </h2>
            <p className="text-slate-600 dark:text-slate-300">
              Správcem Vašich osobních údajů je společnost <strong>Kemp Carlsbad s.r.o.</strong><br/>
              Vaše údaje zpracováváme v souladu s Nařízením Evropského parlamentu a Rady (EU) 2016/679 (obecné nařízení o ochraně osobních údajů, dále jen „GDPR“).
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <RefreshCw className="h-5 w-5 text-indigo-500" />
              2. Účel a právní základ zpracování
            </h2>
            <p className="text-slate-600 dark:text-slate-300">
              Vaše osobní údaje zpracováváme výhradně za následujícími účely:
            </p>
            <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300 space-y-2 mt-2">
              <li><strong>Plnění zákonných povinností:</strong> Vedení evidenční knihy a hlášení pobytu cizinců (Zákon č. 326/1999 Sb., o pobytu cizinců), a výběr místních poplatků z pobytu (Zákon č. 565/1990 Sb., o místních poplatcích). Poplatek činí <strong>20 CZK za noc</strong> (děti jsou od poplatku osvobozeny).</li>
              <li><strong>Plnění smlouvy:</strong> Poskytnutí ubytovacích služeb a správa Vaší rezervace.</li>
            </ul>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-indigo-500" />
              3. Doba uchování údajů
            </h2>
            <p className="text-slate-600 dark:text-slate-300">
              Osobní údaje vedené v evidenční knize jsme ze zákona povinni uchovávat po dobu <strong>6 let</strong> od ukončení ubytování. Po uplynutí této zákonné lhůty jsou údaje z našeho systému <strong>automaticky smazány a anonymizovány</strong>.
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Trash2 className="h-5 w-5 text-indigo-500" />
              4. Vaše práva
            </h2>
            <p className="text-slate-600 dark:text-slate-300 mb-2">
              Podle GDPR máte následující práva:
            </p>
            <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300 space-y-2">
              <li><strong>Právo na přístup (Export údajů):</strong> Máte právo získat potvrzení, zda zpracováváme Vaše osobní údaje, a právo na jejich kopii.</li>
              <li><strong>Právo na výmaz (Právo být zapomenut):</strong> Můžete požádat o smazání Vašich osobních údajů. Upozorňujeme však, že toto právo <strong>nelze uplatnit</strong> na údaje, které musíme uchovávat na základě zákona (např. evidenční kniha) po dobu oněch 6 let. Další nepotřebné údaje (např. e-mail) smazat lze.</li>
              <li><strong>Právo na opravu:</strong> Máte právo na opravu nepřesných údajů.</li>
            </ul>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Mail className="h-5 w-5 text-indigo-500" />
              5. Uplatnění práv
            </h2>
            <p className="text-slate-600 dark:text-slate-300">
              Pro uplatnění práva na přístup, výmaz nebo opravu údajů (Data Subject Access Request) kontaktujte recepci nebo odešlete žádost e-mailem. Systém je vybaven funkcemi pro bezpečný export a anonymizaci dat dle Vašich požadavků a zákonných limitů.
            </p>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-700 text-sm text-slate-500 text-center">
            Naposledy aktualizováno: Květen 2026. Tyto zásady jsou platné pro všechny hosty Kemp Carlsbad s.r.o.
          </div>

        </div>
      </div>
    </div>
  );
}
