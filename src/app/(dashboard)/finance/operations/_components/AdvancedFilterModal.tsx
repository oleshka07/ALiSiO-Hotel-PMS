import React, { useState, useRef, useEffect } from 'react';
import { X, Search } from 'lucide-react';

interface NamedRow { id: string; name: string; }
interface CategoryRow { id: string; name: string; icon: string | null; op_type: string | null; }
interface Account { id: string; name: string; currency: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  counterparties: NamedRow[];
  projects: NamedRow[];
  tags: NamedRow[];
  accounts: Account[];
  
  initialCategoryIds: Set<string>;
  initialCounterpartyIds: Set<string>;
  initialProjectIds: Set<string>;
  initialTagIds: Set<string>;
  initialAccountIds: Set<string>;
  initialOpTypes: Set<string>;

  onApply: (
    catIds: Set<string>,
    cpIds: Set<string>,
    projIds: Set<string>,
    tagIds: Set<string>,
    accIds: Set<string>,
    opTypes: Set<string>
  ) => void;
}

export default function AdvancedFilterModal({
  isOpen, onClose, categories, counterparties, projects, tags, accounts,
  initialCategoryIds, initialCounterpartyIds, initialProjectIds, initialTagIds, initialAccountIds, initialOpTypes,
  onApply
}: Props) {
  const [catIds, setCatIds] = useState(new Set(initialCategoryIds));
  const [cpIds, setCpIds] = useState(new Set(initialCounterpartyIds));
  const [projIds, setProjIds] = useState(new Set(initialProjectIds));
  const [tagIds, setTagIds] = useState(new Set(initialTagIds));
  const [accIds, setAccIds] = useState(new Set(initialAccountIds));
  const [opTypes, setOpTypes] = useState(new Set(initialOpTypes));

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCatIds(new Set(initialCategoryIds));
      setCpIds(new Set(initialCounterpartyIds));
      setProjIds(new Set(initialProjectIds));
      setTagIds(new Set(initialTagIds));
      setAccIds(new Set(initialAccountIds));
      setOpTypes(new Set(initialOpTypes));
    }
  }, [isOpen, initialCategoryIds, initialCounterpartyIds, initialProjectIds, initialTagIds, initialAccountIds, initialOpTypes]);

  // Removed problematic mousedown listener

  if (!isOpen) return null;

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div ref={modalRef} onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-primary)', width: 600, maxWidth: '90vw',
        borderRadius: 12, padding: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '90vh'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Фільтри</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 8 }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Types and Categories */}
            <Dropdown 
              title="Типи платежів та категорії" 
              placeholder="Всі типи платежів і категорій"
              selectedCount={opTypes.size + catIds.size}
            >
              <div style={{ fontWeight: 600, margin: '8px 0 4px', fontSize: 13, color: 'var(--text-secondary)' }}>Типи</div>
              <CheckboxItem label="Доходи" checked={opTypes.has('income')} onChange={(c) => toggleSet(setOpTypes, 'income', c)} />
              <CheckboxItem label="Витрати" checked={opTypes.has('expense')} onChange={(c) => toggleSet(setOpTypes, 'expense', c)} />
              <CheckboxItem label="Перекази" checked={opTypes.has('transfer')} onChange={(c) => toggleSet(setOpTypes, 'transfer', c)} />
              <div style={{ fontWeight: 600, margin: '12px 0 4px', fontSize: 13, color: 'var(--text-secondary)' }}>Категорії</div>
              {categories.map(c => (
                <CheckboxItem key={c.id} label={`${c.icon || ''} ${c.name}`} checked={catIds.has(c.id)} onChange={(chk) => toggleSet(setCatIds, c.id, chk)} searchVal={`${c.icon||''} ${c.name}`} />
              ))}
            </Dropdown>

            {/* Counterparties */}
            <Dropdown 
              title="Контрагенти" 
              placeholder="Всі контрагенти"
              selectedCount={cpIds.size}
            >
              {counterparties.map(c => (
                <CheckboxItem key={c.id} label={c.name} checked={cpIds.has(c.id)} onChange={(chk) => toggleSet(setCpIds, c.id, chk)} searchVal={c.name} />
              ))}
            </Dropdown>

            {/* Projects */}
            <Dropdown 
              title="Проєкт" 
              placeholder="Всі проєкти"
              selectedCount={projIds.size}
            >
              {projects.map(c => (
                <CheckboxItem key={c.id} label={c.name} checked={projIds.has(c.id)} onChange={(chk) => toggleSet(setProjIds, c.id, chk)} searchVal={c.name} />
              ))}
            </Dropdown>

            {/* Accounts */}
            <Dropdown 
              title="Рахунки" 
              placeholder="Всі рахунки"
              selectedCount={accIds.size}
            >
              {accounts.map(c => (
                <CheckboxItem key={c.id} label={c.name} checked={accIds.has(c.id)} onChange={(chk) => toggleSet(setAccIds, c.id, chk)} searchVal={c.name} />
              ))}
            </Dropdown>

            {/* Tags */}
            <Dropdown 
              title="Теги" 
              placeholder="Всі теги"
              selectedCount={tagIds.size}
            >
              {tags.map(c => (
                <CheckboxItem key={c.id} label={c.name} checked={tagIds.has(c.id)} onChange={(chk) => toggleSet(setTagIds, c.id, chk)} searchVal={c.name} />
              ))}
            </Dropdown>
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--border-primary)' }}>
          <button 
            onClick={() => {
              setCatIds(new Set()); setCpIds(new Set()); setProjIds(new Set()); setTagIds(new Set()); setAccIds(new Set()); setOpTypes(new Set());
            }}
            style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
          >
            Скинути всі
          </button>
          
          <button 
            onClick={() => {
              onApply(catIds, cpIds, projIds, tagIds, accIds, opTypes);
              onClose();
            }}
            style={{ padding: '10px 24px', background: '#34d399', color: '#064e3b', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 15 }}
          >
            Зберегти фільтр
          </button>
        </div>
      </div>
    </div>
  );
}

function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, val: string, checked: boolean) {
  setter(prev => {
    const n = new Set(prev);
    if (checked) n.add(val); else n.delete(val);
    return n;
  });
}

function Dropdown({ title, placeholder, selectedCount, children }: { title: string; placeholder: string; selectedCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  // Recursively filter children based on searchVal prop
  const filterChildren = (nodes: React.ReactNode): React.ReactNode => {
    if (!search.trim()) return nodes;
    const lowerSearch = search.toLowerCase();
    
    return React.Children.map(nodes, child => {
      if (!React.isValidElement(child)) return child;
      
      const props = child.props as any;
      if (props.searchVal) {
        if (!props.searchVal.toLowerCase().includes(lowerSearch)) return null;
      }
      return child;
    });
  };

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', position: 'relative' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{title}</div>
      <div 
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}
      >
        <span>{selectedCount > 0 ? `Вибрано: ${selectedCount}` : placeholder}</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>
      
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)', borderRadius: 8, marginTop: 4,
          maxHeight: 250, overflowY: 'auto', zIndex: 10, padding: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }} onClick={e => e.stopPropagation()}>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 6, padding: '4px 8px' }}>
            <Search size={14} color="var(--text-secondary)" />
            <input 
              autoFocus
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Пошук..." 
              style={{ border: 'none', background: 'transparent', outline: 'none', padding: '4px 8px', fontSize: 13, width: '100%' }}
            />
          </div>
          <div className="filter-list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filterChildren(children)}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckboxItem({ label, checked, onChange, searchVal }: { label: string; checked: boolean; onChange: (c: boolean) => void; searchVal?: string; }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span style={{ fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </label>
  );
}
