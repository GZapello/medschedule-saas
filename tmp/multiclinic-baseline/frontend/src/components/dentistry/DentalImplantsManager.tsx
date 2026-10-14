import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, AlertCircle, Clock, Calendar, ShieldCheck, Trash2, X, Loader2, Package } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { ClinicalInventorySelector, ClinicalInventorySelection } from '../clinical/ClinicalInventorySelector';

export interface DentalImplantItem {
  id: string;
  patient_id?: string;
  appointment_id?: string;
  tooth_number?: number;
  implant_brand: string;
  implant_model?: string;
  implant_diameter?: number;
  implant_length?: number;
  insertion_torque_ncm?: number;
  stability_isq?: number;
  bone_graft_used?: boolean;
  graft_material?: string;
  installation_date: string;
  expected_osseointegration_date?: string;
  status: 'planned' | 'installed' | 'osseointegrated' | 'loaded' | 'failed';
  batch_number?: string;
  anvisa_registration?: string;
  notes?: string;
}

export interface DentalImplantsManagerProps {
  patientId: string;
  appointmentId?: string;
  readOnly?: boolean;
}

export const DentalImplantsManager: React.FC<DentalImplantsManagerProps> = ({
  patientId,
  appointmentId,
  readOnly = false
}) => {
  const [implants, setImplants] = useState<DentalImplantItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Central Inventory Integration
  const [useInventory, setUseInventory] = useState(false);
  const [inventorySelection, setInventorySelection] = useState<ClinicalInventorySelection>({
    productId: null,
    productName: '',
    quantity: 1,
    unit: 'un',
    withoutProduct: true
  });

  // Form states
  const [toothNumber, setToothNumber] = useState<number>(36);
  const [implantBrand, setImplantBrand] = useState('Neodent');
  const [implantModel, setImplantModel] = useState('Helix GM');
  const [implantDiameter, setImplantDiameter] = useState<number>(3.75);
  const [implantLength, setImplantLength] = useState<number>(10);
  const [insertionTorque, setInsertionTorque] = useState<number>(45);
  const [stabilityIsq, setStabilityIsq] = useState<number>(72);
  const [boneGraftUsed, setBoneGraftUsed] = useState(false);
  const [graftMaterial, setGraftMaterial] = useState('');
  const [installationDate, setInstallationDate] = useState(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  );
  const [expectedOsseointegrationDate, setExpectedOsseointegrationDate] = useState('');
  const [status, setStatus] = useState<DentalImplantItem['status']>('installed');
  const [batchNumber, setBatchNumber] = useState('');
  const [anvisaRegistration, setAnvisaRegistration] = useState('');
  const [notes, setNotes] = useState('');

  const loadImplants = async () => {
    if (!patientId) return;
    try {
      setIsLoading(true);
      const res = await ApiClient.get(`/v1/dentistry/implants/${patientId}`);
      if (Array.isArray(res)) setImplants(res);
    } catch (err) {
      console.error('[DentalImplantsManager] Erro ao carregar implantes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadImplants();
  }, [patientId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !implantBrand) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // Baixa no estoque clínico central se selecionado
      if (useInventory && inventorySelection.productId) {
        try {
          await ApiClient.post('/v1/clinical-inventory/usage', {
            productId: inventorySelection.productId,
            quantity: 1,
            patientId,
            appointmentId: appointmentId || undefined,
            toothNumber: toothNumber ? String(toothNumber) : undefined,
            region: toothNumber ? `Dente ${toothNumber}` : undefined,
            procedureDescription: `Instalação de implante: ${implantBrand} ${implantModel || ''}`.trim()
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('zemda-inventory-updated'));
          }
        } catch (invErr: any) {
          console.warn('[DentalImplantsManager] Erro ao registrar baixa de implante no estoque:', invErr);
        }
      }

      await ApiClient.post('/v1/dentistry/implants', {
        patientId,
        appointmentId: appointmentId || undefined,
        toothNumber: Number(toothNumber) || null,
        toothRegion: String(toothNumber),
        implantBrand,
        implantModel,
        implantDiameter: Number(implantDiameter) || null,
        implantLength: Number(implantLength) || null,
        insertionTorqueNcm: Number(insertionTorque) || null,
        stabilityIsq: Number(stabilityIsq) || null,
        boneGraftUsed,
        graftMaterial: graftMaterial || null,
        installationDate,
        expectedOsseointegrationDate: expectedOsseointegrationDate || null,
        status,
        batchNumber: batchNumber || null,
        anvisaRegistration: anvisaRegistration || null,
        notes: notes || null
      });

      setIsAdding(false);
      setUseInventory(false);
      setInventorySelection({
        productId: null,
        productName: '',
        quantity: 1,
        unit: 'un',
        withoutProduct: true
      });
      await loadImplants();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Erro ao cadastrar implante';
      console.error('[DentalImplantsManager] Erro ao salvar implante:', err);
      setSubmitError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (st: DentalImplantItem['status']) => {
    switch (st) {
      case 'osseointegrated':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Osseointegrado
          </span>
        );
      case 'loaded':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
            Prótese Instalada (Carga)
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
            Perda / Falha
          </span>
        );
      case 'planned':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">
            Planejado
          </span>
        );
      case 'installed':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 flex items-center gap-1">
            <Clock className="w-3 h-3 text-purple-600" /> Instalado (Em Cicatrização)
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            Registro Cirúrgico de Implantes Dentários
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Rastreabilidade de implantes, torques cirúrgicos (N.cm), enxertos e previsão de osseointegração
          </p>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold shadow-sm transition"
          >
            {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isAdding ? 'Cancelar' : '+ Novo Implante'}
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 rounded-2xl space-y-3">
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-purple-200 dark:border-purple-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-purple-600" />
                <span>Estoque Central da Clínica (Opcional)</span>
              </label>
              <button
                type="button"
                onClick={() => setUseInventory(!useInventory)}
                className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 hover:underline cursor-pointer"
              >
                {useInventory ? 'Digitar manualmente' : '+ Selecionar implante do estoque'}
              </button>
            </div>

            {useInventory && (
              <ClinicalInventorySelector
                value={inventorySelection}
                onChange={(sel) => {
                  setInventorySelection(sel);
                  if (sel.productId) {
                    if (sel.brand) setImplantBrand(sel.brand);
                    else if (sel.productName) setImplantBrand(sel.productName.split(' ')[0] || sel.productName);
                    if (sel.productName) setImplantModel(sel.productName);
                    if (sel.batchLot) setBatchNumber(sel.batchLot);
                  }
                }}
                defaultCategory="Implantodontia"
              />
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Dente / Posição (FDI)</label>
              <input
                type="number"
                value={toothNumber}
                onChange={e => setToothNumber(Number(e.target.value))}
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Marca *</label>
              <input
                type="text"
                required
                value={implantBrand}
                onChange={e => setImplantBrand(e.target.value)}
                placeholder="Neodent, Straumann, Nobel"
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Modelo / Linha</label>
              <input
                type="text"
                value={implantModel}
                onChange={e => setImplantModel(e.target.value)}
                placeholder="Helix GM, BLT, Cono Morse"
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl font-bold"
              >
                <option value="installed">Instalado</option>
                <option value="osseointegrated">Osseointegrado</option>
                <option value="loaded">Carga / Prótese</option>
                <option value="planned">Planejado</option>
                <option value="failed">Falha / Perdido</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Diâmetro (mm)</label>
              <input
                type="number"
                step="0.05"
                value={implantDiameter}
                onChange={e => setImplantDiameter(Number(e.target.value))}
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Comprimento (mm)</label>
              <input
                type="number"
                step="0.5"
                value={implantLength}
                onChange={e => setImplantLength(Number(e.target.value))}
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Torque Inserção (N.cm)</label>
              <input
                type="number"
                value={insertionTorque}
                onChange={e => setInsertionTorque(Number(e.target.value))}
                placeholder="Ex: 45 N.cm"
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl font-black text-purple-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Estabilidade (ISQ)</label>
              <input
                type="number"
                value={stabilityIsq}
                onChange={e => setStabilityIsq(Number(e.target.value))}
                placeholder="Ex: 70"
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Data de Instalação</label>
              <input
                type="date"
                value={installationDate}
                onChange={e => setInstallationDate(e.target.value)}
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Previsão Osseointegração</label>
              <input
                type="date"
                value={expectedOsseointegrationDate}
                onChange={e => setExpectedOsseointegrationDate(e.target.value)}
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Lote / Registro ANVISA</label>
              <input
                type="text"
                value={batchNumber}
                onChange={e => setBatchNumber(e.target.value)}
                placeholder="Lote do implante"
                className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl font-mono text-[11px]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={boneGraftUsed}
                onChange={e => setBoneGraftUsed(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <span>Enxerto Ósseo Realizado no Sítio</span>
            </label>
            {boneGraftUsed && (
              <input
                type="text"
                value={graftMaterial}
                onChange={e => setGraftMaterial(e.target.value)}
                placeholder="Material de enxerto (ex: Bio-Oss, osso particulado autógeno)"
                className="flex-1 text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Registro de Implante'
              )}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-6 text-xs text-slate-400">Carregando implantes...</div>
        ) : implants.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-6 text-slate-400 text-xs">
            Nenhum implante registrado para este paciente. Clique em "+ Novo Implante" para cadastrar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {implants.map(imp => (
              <div
                key={imp.id}
                className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2 hover:border-purple-300 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-purple-600 text-white font-black text-xs flex items-center justify-center">
                      {imp.tooth_number || 'REG'}
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white">
                        {imp.implant_brand} {imp.implant_model || ''}
                      </h4>
                      <span className="text-[10px] text-slate-500">
                        {imp.implant_diameter ? `Ø ${imp.implant_diameter}mm` : ''} {imp.implant_length ? `x ${imp.implant_length}mm` : ''}
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(imp.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                  <div>
                    <strong>Torque:</strong> {imp.insertion_torque_ncm ? `${imp.insertion_torque_ncm} N.cm` : '-'}
                  </div>
                  <div>
                    <strong>Instalação:</strong> {new Date(imp.installation_date).toLocaleDateString('pt-BR')}
                  </div>
                  {imp.expected_osseointegration_date && (
                    <div>
                      <strong>Osseointegração:</strong> {new Date(imp.expected_osseointegration_date).toLocaleDateString('pt-BR')}
                    </div>
                  )}
                  {imp.batch_number && (
                    <div className="font-mono text-[10px] truncate">
                      <strong>Lote:</strong> {imp.batch_number}
                    </div>
                  )}
                </div>

                {imp.bone_graft_used && (
                  <div className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold bg-purple-50 dark:bg-purple-950/30 px-2 py-1 rounded-lg">
                    Enxerto: {imp.graft_material || 'Ósseo'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
