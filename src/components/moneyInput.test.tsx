import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MoneyInput } from './kit';

const setup = (value: number | null) => {
  const onChange = vi.fn();
  const r = render(<MoneyInput value={value} onChange={onChange} />);
  const input = r.container.querySelector('input')!;
  return { onChange, input };
};

describe('MoneyInput salva ao concluir a edição', () => {
  it('Enter seguido de blur grava uma única vez, em centavos', () => {
    const { onChange, input } = setup(10000);
    input.focus();
    fireEvent.change(input, { target: { value: '150,00' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(15000);
  });
  it('não grava a cada tecla', () => {
    const { onChange, input } = setup(null);
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('zero explícito é zero e vazio é ausência', () => {
    const a = setup(500);
    fireEvent.change(a.input, { target: { value: '0' } }); fireEvent.blur(a.input);
    expect(a.onChange).toHaveBeenCalledWith(0);
    const b = setup(500);
    fireEvent.change(b.input, { target: { value: '' } }); fireEvent.blur(b.input);
    expect(b.onChange).toHaveBeenCalledWith(null);
  });
  it('texto inválido fica no campo, marcado, sem gravar', () => {
    const { onChange, input } = setup(500);
    fireEvent.change(input, { target: { value: '12abc' } }); fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('12abc');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
  it('valor idêntico não reenvia', () => {
    const { onChange, input } = setup(500);
    fireEvent.change(input, { target: { value: '5,00' } }); fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });
});
