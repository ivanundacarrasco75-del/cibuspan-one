import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as fflate from 'fflate';
const module={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/estadoCuentaProdubanco.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:()=>fflate,crypto:webcrypto,TextEncoder,Uint8Array,Date});
const {procesarEstadoProdubanco:procesar,estadoMovimientoBancario:estado,nombreBancoProdubanco:banco}=module.exports
const hojas=(filas)=>[{sheet:'Hoja1',data:[['Desde:','11/01/2026'],['Hasta:','11/30/2026'],['Cuenta:','02005231686'],['Moneda:','DOLAR'],['FECHA PROCESO','TRANSACCIÓN','CAUSAL','TOTAL','','','REFERENCIA','OFICINA'],...filas]}]
const fila=(ref,monto,causal='1049 - PAGO PROVEEDORES SUPERMAXI',fecha='11/24/2026')=>[fecha,'NOTA DE CREDITO',causal,monto,'','',ref,'MATRIZ']
test('Clasifica ingresos positivos, conserva referencias y distingue reversos, propios, débitos y desconocidos',async()=>{
 const e=await procesar('noviembre.xlsx',hojas([fila('0001','100.25'),fila('2','-2.00'),fila('3','50','3 - MISMO CLIENTE'),fila('4','2','(REV) CARGO'),fila('5','30','999 - OTRO')]),'a'.repeat(64))
 assert.equal(e.debitos,1);assert.equal(e.movimientos.length,4);assert.equal(e.movimientos[0].referencia,'0001');assert.equal(e.movimientos[0].fecha,'2026-11-24');assert.deepEqual(Array.from(e.movimientos,m=>m.clase),['INGRESO','EXCLUIDO','EXCLUIDO','REVISAR'])
 const m=e.movimientos[0],d={...m,banco:banco(e.cuenta,e.tipo),anulado:false};assert.equal(estado(m,e,[d],e.movimientos),'DUPLICADO');assert.equal(estado(m,e,[{...d,monto:101}],e.movimientos),'CONFLICTO');assert.equal(estado(m,e,[{...d,anulado:true}],e.movimientos),'CONFLICTO')
 const repetido=await procesar('noviembre.xlsx',hojas([fila('1','1'),fila('1','1')]),'x');assert.equal(estado(repetido.movimientos[0],repetido,[],repetido.movimientos),'CONFLICTO')
})
test('Rechaza fechas inválidas o fuera de período, importes incompletos y referencias vacías sin cargar parcialmente',async()=>{
 for(const r of [fila('1','100',undefined,'11/31/2026'),fila('1','100',undefined,'10/30/2026'),fila('1','1.001'),fila('','100')])await assert.rejects(procesar('noviembre.xlsx',hojas([r]),'x'))
})
