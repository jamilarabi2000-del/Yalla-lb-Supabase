import React from 'react';

/**
 * The attributes that tie an input to its error message: a screen reader says
 * the message when the field takes focus. Nothing is added while the field is fine.
 */
export const invalidProps = (id: string, message?: string) =>
  message ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};

/** What is wrong with a field, shown beside it until the visitor fixes it. */
export const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? <p id={`${id}-error`} className="mt-1 text-[11px] font-semibold text-[#C62828]">{message}</p> : null;
