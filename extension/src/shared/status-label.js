// src/shared/status-label.js
//
// VERIFY_STATUS -> human-readable label. Shared by the popup and the
// detail page (extension/src/detail/) so wording can't drift between them.

import { VERIFY_STATUS } from './constants.js';

export function statusToLabel(status) {
  switch (status) {
    case VERIFY_STATUS.VERIFIED_TRUSTED:    return 'Verified — trusted';
    case VERIFY_STATUS.VERIFIED_TSA:        return 'Verified via TSA';
    case VERIFY_STATUS.VERIFIED_UNTRUSTED:  return 'Signed — provider not in trust list';
    case VERIFY_STATUS.SIGNING_EXPIRED:     return 'Expired (No TSA)';
    case VERIFY_STATUS.CONTENT_TAMPERED:    return 'Content tampered';
    case VERIFY_STATUS.BROKEN_SIGNATURE:    return 'Broken signature';
    case VERIFY_STATUS.INVALID_OR_CHANGED:  return 'Invalid or changed';
    case VERIFY_STATUS.NO_CREDENTIALS:      return 'No Content Credentials';
    case VERIFY_STATUS.UNSUPPORTED_FORMAT:  return 'Format not supported';
    case 'error':                           return 'Error';
    default:                                return status ?? 'Unknown';
  }
}
