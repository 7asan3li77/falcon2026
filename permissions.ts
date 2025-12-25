
import { User } from './types';
import { subscriptionTables, pensionTables } from './components/data';

export interface AppStructureNode {
    id: string;
    label: string;
    children?: AppStructureNode[];
}

const createSafeId = (name: string) => {
    // A simple function to create a more stable ID from a table name
    return name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').toLowerCase();
}

const subscriptionTableNodes: AppStructureNode[] = subscriptionTables.map(table => ({
    id: createSafeId(table.name),
    label: table.name
}));

const pensionTableNodes: AppStructureNode[] = pensionTables.map(table => ({
    id: createSafeId(table.name),
    label: table.name
}));


export const APP_STRUCTURE: AppStructureNode[] = [
    { id: 'calculator', label: 'برنامج حساب المعاشات' },
    { id: 'subscription-calculator', label: 'برنامج حساب الاشتراكات' },
    { id: 'additional-amounts-calculator', label: 'برنامج حساب المبالغ الإضافية' },
    { id: 'legislations', label: 'التشريعات' },
    {
        id: 'tables',
        label: 'جداول الهيئة',
        children: [
            {
                id: 'subscriptions',
                label: 'جداول الاشتراكات',
                children: subscriptionTableNodes
            },
            {
                id: 'pensions',
                label: 'جداول المعاشات',
                children: pensionTableNodes
            },
        ],
    },
    { id: 'user-management', label: 'إدارة صلاحيات المستخدمين' },
    { id: 'settings', label: 'الإعدادات' },
];

export function hasPermission(user: User, path: string, action: 'read' | 'add' | 'modify' | 'delete'): boolean {
    const pathParts = path.split('.');
    let currentPermsNode = user.permissions;

    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        
        // Find the corresponding structure node to check for children
        const findNode = (nodes: AppStructureNode[], id: string): AppStructureNode | undefined => {
             for(const node of nodes) {
                if(node.id === id) return node;
                if(node.children) {
                    const found = findNode(node.children, id);
                    if(found) return found;
                }
            }
            return undefined;
        }

        if (!currentPermsNode || !currentPermsNode[part]) {
            return false; // Path does not exist in permissions
        }

        if (i < pathParts.length - 1) {
            currentPermsNode = currentPermsNode[part].children as any;
        } else {
             return !!currentPermsNode[part]?.[action];
        }
    }
    return false;
}
