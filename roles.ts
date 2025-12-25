
import { UserPermissions, PermissionNode, Role } from './types';
import { APP_STRUCTURE, AppStructureNode } from './permissions';

// --- Permission Presets ---
const all: PermissionNode = { read: true, add: true, modify: true, delete: true };
const read: PermissionNode = { read: true };
const readAddMod: PermissionNode = { read: true, add: true, modify: true };
const none: PermissionNode = {};

// --- Helper to build a fully populated permission tree ---
export function generateFullPermissions(base: UserPermissions = {}): UserPermissions {
    const fullPerms: UserPermissions = {};

    function recurse(structureNodes: AppStructureNode[], permsNode: UserPermissions | undefined, targetNode: UserPermissions) {
        for (const node of structureNodes) {
            const basePerm = permsNode?.[node.id];
            targetNode[node.id] = {
                read: !!basePerm?.read,
                add: !!basePerm?.add,
                modify: !!basePerm?.modify,
                delete: !!basePerm?.delete,
            };
            if (node.children) {
                targetNode[node.id].children = {};
                recurse(node.children, basePerm?.children, targetNode[node.id].children!);
            }
        }
    }
    recurse(APP_STRUCTURE, base, fullPerms);
    return fullPerms;
}

// --- Role Definitions ---
export const initialRolePermissions: Record<string, UserPermissions> = {
    'مدير': generateFullPermissions({
        calculator: all,
        'subscription-calculator': all,
        'additional-amounts-calculator': all,
        legislations: all,
        tables: all,
        'user-management': all,
        settings: all,
    }),
    'مراجع': generateFullPermissions({
        calculator: read,
        'subscription-calculator': read,
        'additional-amounts-calculator': read,
        legislations: read,
        tables: read,
    }),
    'مسجل': generateFullPermissions({
        calculator: readAddMod,
        'subscription-calculator': readAddMod,
        'additional-amounts-calculator': all,
        legislations: read,
        tables: read,
    }),
    'رقابة': generateFullPermissions({
        calculator: read,
        'subscription-calculator': read,
        'additional-amounts-calculator': read,
        legislations: read,
        tables: read,
        'user-management': read,
        settings: read,
    }),
};

export const ROLES: Exclude<Role, 'مخصص'>[] = ['مدير', 'مسجل', 'مراجع', 'رقابة'];
