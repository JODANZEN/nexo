import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';

export interface ActaTally {
  value: string;
  coeficiente: string;
  pct: string;
}
export interface ActaData {
  title: string;
  conjuntoName: string;
  dateLabel: string;
  quorumReachedAt: string | null;
  quorumPct: string;
  agenda: { order: number; title: string; tallies: ActaTally[] }[];
  attendees: { unitNumber: string; name: string; coeficiente: string }[];
}

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  h1: { fontSize: 18, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  h2: { fontSize: 13, marginTop: 16, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  meta: { marginBottom: 2, color: '#444' },
  row: { flexDirection: 'row', borderBottom: '1px solid #ddd', paddingVertical: 3 },
  cell: { flex: 1 },
  itemTitle: { marginTop: 8, fontFamily: 'Helvetica-Bold' },
});

const e = React.createElement;

// Build the Acta PDF as a Buffer. No JSX — plain React.createElement.
export function buildActaPdf(data: ActaData): Promise<Buffer> {
  const doc = e(
    Document,
    null,
    e(
      Page,
      { size: 'A4', style: s.page },
      e(Text, { style: s.h1 }, `Acta — ${data.title}`),
      e(Text, { style: s.meta }, `Conjunto: ${data.conjuntoName}`),
      e(Text, { style: s.meta }, `Fecha: ${data.dateLabel}`),
      e(
        Text,
        { style: s.meta },
        `Quórum alcanzado: ${data.quorumReachedAt ?? 'No alcanzado'} (${data.quorumPct}%)`,
      ),

      e(Text, { style: s.h2 }, 'Orden del día y resultados'),
      ...data.agenda.map((item) =>
        e(
          View,
          { key: String(item.order), wrap: false },
          e(Text, { style: s.itemTitle }, `${item.order}. ${item.title}`),
          ...item.tallies.map((t) =>
            e(
              View,
              { key: t.value, style: s.row },
              e(Text, { style: s.cell }, t.value),
              e(Text, { style: s.cell }, `coef ${t.coeficiente}`),
              e(Text, { style: s.cell }, `${t.pct}%`),
            ),
          ),
        ),
      ),

      e(Text, { style: s.h2 }, 'Asistentes'),
      ...data.attendees.map((a, i) =>
        e(
          View,
          { key: String(i), style: s.row },
          e(Text, { style: s.cell }, `Apto ${a.unitNumber}`),
          e(Text, { style: s.cell }, a.name),
          e(Text, { style: s.cell }, `coef ${a.coeficiente}`),
        ),
      ),
    ),
  );

  return renderToBuffer(doc);
}
