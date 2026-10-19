import React, { useState } from 'react';
import {
  Network,
  PlusCircle,
  ChevronRight,
  ChevronDown,
  Edit2,
  Trash2,
  Tag,
  Users2,
  Contact2,
  Navigation,
  FolderPlus,
  Search,
  Building2,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext.tsx';
import { OrgNode } from '../../types/erp.ts';
import { getSupabase } from '../../lib/supabase.ts';

// Helper to recursively find and update a node in the org tree
function updateNodeInTree(root: OrgNode, targetId: string, updater: (node: OrgNode) => OrgNode): OrgNode {
  if (root.id === targetId) {
    return updater(root);
  }
  if (!root.children || root.children.length === 0) {
    return root;
  }
  return {
    ...root,
    children: root.children.map((child) => updateNodeInTree(child, targetId, updater)),
  };
}

// Helper to recursively add a child node under a parent
function addChildNodeInTree(root: OrgNode, parentId: string, newNode: OrgNode): OrgNode {
  if (root.id === parentId) {
    return {
      ...root,
      children: [...(root.children || []), newNode],
    };
  }
  if (!root.children || root.children.length === 0) {
    return root;
  }
  return {
    ...root,
    children: root.children.map((child) => addChildNodeInTree(child, parentId, newNode)),
  };
}

// Helper to recursively delete a node from the org tree
function deleteNodeFromTree(root: OrgNode, targetId: string): OrgNode {
  if (!root.children) return root;
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== targetId)
      .map((child) => deleteNodeFromTree(child, targetId)),
  };
}

// Helper to flatten tree into list with hierarchy depth and path
interface FlatOrgOption {
  id: string;
  name: string;
  type: OrgNode['type'];
  code: string;
  level: number;
}

function flattenOrgTree(root: OrgNode, level: number = 0, result: FlatOrgOption[] = []): FlatOrgOption[] {
  result.push({
    id: root.id,
    name: root.name,
    type: root.type,
    code: root.code,
    level,
  });
  if (root.children) {
    for (const child of root.children) {
      flattenOrgTree(child, level + 1, result);
    }
  }
  return result;
}

export const OrgHierarchyAndRoles: React.FC = () => {
  const {
    orgHierarchy,
    setOrgHierarchy,
    addAuditLog,
    distributors,
    customers,
    fieldForceReps,
  } = useERP();

  // Node Selection State for Inspector / Tagging Panel
  const [selectedNodeId, setSelectedNodeId] = useState<string>(orgHierarchy.id);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Record<string, boolean>>({});

  // Search filter across hierarchy
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState<OrgNode | null>(null);
  const [nodeToTag, setNodeToTag] = useState<OrgNode | null>(null);

  // Form State: Add Node
  const [newParentId, setNewParentId] = useState<string>(orgHierarchy.id);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeType, setNewNodeType] = useState<OrgNode['type']>('Territory');
  const [newNodeCode, setNewNodeCode] = useState('');
  const [newNodeHead, setNewNodeHead] = useState('');
  const [newNodePhone, setNewNodePhone] = useState('');
  const [newNodeNotes, setNewNodeNotes] = useState('');

  // Form State: Tag Entities
  const [selectedDistIds, setSelectedDistIds] = useState<string[]>([]);
  const [selectedCustIds, setSelectedCustIds] = useState<string[]>([]);
  const [selectedFfIds, setSelectedFfIds] = useState<string[]>([]);
  const [tagModalActiveTab, setTagModalActiveTab] = useState<'distributors' | 'customers' | 'fieldforce'>('distributors');
  const [tagSearchQuery, setTagSearchQuery] = useState('');

  // Find a specific node by ID in tree
  const findNode = (root: OrgNode, id: string): OrgNode | null => {
    if (root.id === id) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedNode = findNode(orgHierarchy, selectedNodeId) || orgHierarchy;
  const flatNodes = flattenOrgTree(orgHierarchy);

  const toggleCollapse = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodeIds((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // Open Add Node Modal with default parent
  const handleOpenAddModal = (defaultParentId?: string) => {
    setNewParentId(defaultParentId || selectedNodeId || orgHierarchy.id);
    setNewNodeName('');
    setNewNodeType('Territory');
    setNewNodeCode('');
    setNewNodeHead('');
    setNewNodePhone('');
    setNewNodeNotes('');
    setShowAddModal(true);
  };

  // Open Edit Node Modal
  const handleOpenEditModal = (node: OrgNode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNodeToEdit(node);
    setShowEditModal(true);
  };

  // Open Tagging Modal
  const handleOpenTagModal = (node: OrgNode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNodeToTag(node);
    setSelectedDistIds(node.taggedDistributorIds || []);
    setSelectedCustIds(node.taggedCustomerIds || []);
    setSelectedFfIds(node.taggedFieldForceIds || []);
    setTagSearchQuery('');
    setShowTagModal(true);
  };

  // Submit Add Node
  const handleAddNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeName.trim()) return;

    const generatedCode =
      newNodeCode.trim().toUpperCase() ||
      `${newNodeType.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    const newNode: OrgNode = {
      id: `org-${Date.now().toString().slice(-5)}`,
      name: newNodeName.trim(),
      type: newNodeType,
      code: generatedCode,
      parentId: newParentId || undefined,
      headPerson: newNodeHead.trim(),
      phone: newNodePhone.trim(),
      notes: newNodeNotes.trim(),
      children: [],
      taggedDistributorIds: [],
      taggedCustomerIds: [],
      taggedFieldForceIds: [],
    };

    if (!orgHierarchy.name || !newParentId) {
      setOrgHierarchy(newNode);
    } else {
      setOrgHierarchy((prev) => addChildNodeInTree(prev, newParentId, newNode));
    }
    setSelectedNodeId(newNode.id);

    // Sync to Supabase
    const sb = getSupabase();
    if (sb) {
      sb.from('org_hierarchy')
        .upsert({
          node_id: newNode.id,
          code: newNode.code,
          name: newNode.name,
          type: newNode.type,
          parent_id: newNode.parentId || null,
          head_person: newNode.headPerson || null,
          phone: newNode.phone || null,
          notes: newNode.notes || null,
          tagged_distributor_ids: newNode.taggedDistributorIds || [],
          tagged_customer_ids: newNode.taggedCustomerIds || [],
          tagged_field_force_ids: newNode.taggedFieldForceIds || [],
        })
        .then(({ error }) => {
          if (error) console.warn('Supabase org_hierarchy insert error:', error.message);
        });
    }

    addAuditLog(
      'ORG_NODE_CREATED',
      'Org Hierarchy',
      `Created new hierarchy node [${newNode.type}] "${newNode.name}" (${newNode.code}) under parent ${newParentId || 'Root'}`
    );

    setShowAddModal(false);
  };

  // Submit Edit Node
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeToEdit) return;

    setOrgHierarchy((prev) =>
      updateNodeInTree(prev, nodeToEdit.id, (node) => ({
        ...node,
        name: nodeToEdit.name,
        type: nodeToEdit.type,
        code: nodeToEdit.code.toUpperCase(),
        headPerson: nodeToEdit.headPerson,
        phone: nodeToEdit.phone,
        notes: nodeToEdit.notes,
      }))
    );

    // Sync to Supabase
    const sb = getSupabase();
    if (sb) {
      sb.from('org_hierarchy')
        .update({
          code: nodeToEdit.code.toUpperCase(),
          name: nodeToEdit.name,
          type: nodeToEdit.type,
          head_person: nodeToEdit.headPerson || null,
          phone: nodeToEdit.phone || null,
          notes: nodeToEdit.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('node_id', nodeToEdit.id)
        .then(({ error }) => {
          if (error) console.warn('Supabase org_hierarchy update error:', error.message);
        });
    }

    addAuditLog(
      'ORG_NODE_UPDATED',
      'Org Hierarchy',
      `Updated hierarchy details for "${nodeToEdit.name}" (${nodeToEdit.code})`
    );

    setShowEditModal(false);
    setNodeToEdit(null);
  };

  // Submit Tagging
  const handleSaveTags = () => {
    if (!nodeToTag) return;

    setOrgHierarchy((prev) =>
      updateNodeInTree(prev, nodeToTag.id, (node) => ({
        ...node,
        taggedDistributorIds: selectedDistIds,
        taggedCustomerIds: selectedCustIds,
        taggedFieldForceIds: selectedFfIds,
      }))
    );

    // Sync to Supabase
    const sb = getSupabase();
    if (sb) {
      sb.from('org_hierarchy')
        .update({
          tagged_distributor_ids: selectedDistIds,
          tagged_customer_ids: selectedCustIds,
          tagged_field_force_ids: selectedFfIds,
          updated_at: new Date().toISOString(),
        })
        .eq('node_id', nodeToTag.id)
        .then(({ error }) => {
          if (error) console.warn('Supabase org_hierarchy tag update error:', error.message);
        });
    }

    addAuditLog(
      'ORG_TAGGING_UPDATED',
      'Org Hierarchy',
      `Tagged ${selectedDistIds.length} distributors, ${selectedCustIds.length} customers, and ${selectedFfIds.length} field officers to "${nodeToTag.name}"`
    );

    setShowTagModal(false);
    setNodeToTag(null);
  };

  // Delete Node (Prevent deleting Root Company)
  const handleDeleteNode = (node: OrgNode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.id === orgHierarchy.id || node.type === 'Company') {
      alert('The root enterprise node cannot be deleted.');
      return;
    }
    if (
      !confirm(
        `Are you sure you want to remove hierarchy node "${node.name}" (${node.code})? Any child nodes will also be removed.`
      )
    ) {
      return;
    }

    setOrgHierarchy((prev) => deleteNodeFromTree(prev, node.id));
    setSelectedNodeId(orgHierarchy.id);

    // Sync to Supabase
    const sb = getSupabase();
    if (sb) {
      sb.from('org_hierarchy')
        .delete()
        .eq('node_id', node.id)
        .then(({ error }) => {
          if (error) console.warn('Supabase org_hierarchy delete error:', error.message);
        });
    }

    addAuditLog(
      'ORG_NODE_DELETED',
      'Org Hierarchy',
      `Deleted hierarchy node "${node.name}" (${node.code})`
    );
  };

  // Recursive Tree Node Renderer
  const renderOrgNode = (node: OrgNode, level: number = 0) => {
    const isSelected = selectedNodeId === node.id;
    const isCollapsed = Boolean(collapsedNodeIds[node.id]);
    const hasChildren = Boolean(node.children && node.children.length > 0);

    const distCount = node.taggedDistributorIds?.length || 0;
    const custCount = node.taggedCustomerIds?.length || 0;
    const ffCount = node.taggedFieldForceIds?.length || 0;
    const totalTagged = distCount + custCount + ffCount;

    const matchesSearch =
      searchTerm === '' ||
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (node.headPerson && node.headPerson.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
      <div key={node.id} className="space-y-1">
        <div
          onClick={() => setSelectedNodeId(node.id)}
          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all group ${
            isSelected
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-xs ring-1 ring-blue-500/20'
              : matchesSearch
              ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
              : 'opacity-40 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
          }`}
          style={{ marginLeft: `${level * 16}px` }}
        >
          {/* Node identity info */}
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleCollapse(node.id, e)}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <div className="w-5" />
            )}

            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                node.type === 'Company'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                  : node.type === 'Business Unit'
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                  : node.type === 'Division'
                  ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
                  : node.type === 'Region'
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                  : node.type === 'Area'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}
            >
              {node.type}
            </span>

            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {node.name}
            </span>
            <span className="font-mono text-[10px] text-slate-400 shrink-0">({node.code})</span>

            {/* Tag badge pills */}
            {totalTagged > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 ml-2">
                {distCount > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <Users2 className="w-2.5 h-2.5" />
                    <span>{distCount} DB</span>
                  </span>
                )}
                {custCount > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    <Contact2 className="w-2.5 h-2.5" />
                    <span>{custCount} Cust</span>
                  </span>
                )}
                {ffCount > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <Navigation className="w-2.5 h-2.5" />
                    <span>{ffCount} Rep</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Node Actions & Quick Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {node.headPerson && (
              <span className="text-[11px] text-slate-500 hidden md:inline">
                Head: <b className="text-slate-800 dark:text-slate-200">{node.headPerson}</b>
              </span>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => handleOpenTagModal(node, e)}
                title="Tag Distributors, Customers & Field Force"
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                <Tag className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => handleOpenAddModal(node.id)}
                title="Add Child Node Under This Node"
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => handleOpenEditModal(node, e)}
                title="Edit Hierarchy Node"
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>

              {node.type !== 'Company' && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteNode(node, e)}
                  title="Delete Hierarchy Node"
                  className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/60 text-slate-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Children Render */}
        {!isCollapsed && node.children && node.children.length > 0 && (
          <div className="space-y-1">
            {node.children.map((child) => renderOrgNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Tagged lists for the selected node inspector
  const taggedDistributors = distributors.filter((d) =>
    selectedNode.taggedDistributorIds?.includes(d.id)
  );
  const taggedCustomers = customers.filter((c) =>
    selectedNode.taggedCustomerIds?.includes(c.id)
  );
  const taggedFieldForce = fieldForceReps.filter((r) =>
    selectedNode.taggedFieldForceIds?.includes(r.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
            <span>Basic Data Master</span>
            <span>/</span>
            <span className="text-slate-900 dark:text-white">Organization Hierarchy</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Organization Hierarchy
            </h1>
            
          </div>
          
        </div>
      </div>

      {/* Organization Hierarchy & Tagging */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Interactive Tree View (8 Cols) */}
          <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Network className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Enterprise Hierarchy Tree</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Company ➔ Business Unit ➔ Division ➔ Region ➔ Area ➔ Territory
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search node, territory, code..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-48"
                  />
                </div>

                <button
                  onClick={() => handleOpenAddModal(selectedNodeId)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Child</span>
                </button>
              </div>
            </div>

            {/* Tree nodes list */}
            <div className="space-y-1.5 pt-1 overflow-x-auto">
              {!orgHierarchy.name ? (
                <div className="text-center py-12 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center mx-auto mb-3 text-blue-600 dark:text-blue-400">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    No Organization Hierarchy Found
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Your database table (<code className="text-blue-600 dark:text-blue-400 font-mono">org_hierarchy</code>) has no records. Create your root company node to begin structuring your organization.
                  </p>
                  <button
                    onClick={() => {
                      setNewParentId('');
                      setNewNodeType('Company');
                      setShowAddModal(true);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Create Root Company</span>
                  </button>
                </div>
              ) : (
                renderOrgNode(orgHierarchy)
              )}
            </div>
          </div>

          {/* Right: Selected Node Details & Tagged Entities Inspector (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              {!orgHierarchy.name ? (
                <div className="text-center py-10 px-4 text-slate-400">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-medium">No node selected</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Create your root company node to inspect details and tag entities.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Selected Node Inspector
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {selectedNode.name}
                      </h3>
                      <span className="font-mono text-[10px] text-slate-400">{selectedNode.code}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenTagModal(selectedNode)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-2xs transition-colors"
                      >
                        <Tag className="w-3 h-3" />
                        <span>Tag Entities</span>
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(selectedNode)}
                        className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                        title="Edit Node"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

              {/* Node Metadata Summary */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Hierarchy Level</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedNode.type}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Manager / In-Charge</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {selectedNode.headPerson || 'Unassigned'}
                  </span>
                </div>
                {selectedNode.phone && (
                  <div className="col-span-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px]">
                    <span className="text-[10px] text-slate-400 block">Phone / Hotline</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {selectedNode.phone}
                    </span>
                  </div>
                )}
                {selectedNode.notes && (
                  <div className="col-span-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px]">
                    <span className="text-[10px] text-slate-400 block">Coverage Notes</span>
                    <span className="text-slate-600 dark:text-slate-300 italic">
                      {selectedNode.notes}
                    </span>
                  </div>
                )}
              </div>

              {/* Tagged Associations Cards */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Tagged Entities ({taggedDistributors.length + taggedCustomers.length + taggedFieldForce.length})
                  </span>
                  <button
                    onClick={() => handleOpenTagModal(selectedNode)}
                    className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Edit Tags
                  </button>
                </div>

                {/* Section 1: Tagged Distributors */}
                <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200">
                    <div className="flex items-center gap-1.5">
                      <Users2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Distributor Points ({taggedDistributors.length})</span>
                    </div>
                  </div>
                  {taggedDistributors.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No distributors tagged to this level.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {taggedDistributors.map((d) => (
                        <div
                          key={d.id}
                          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200/60 dark:border-amber-900/40 text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{d.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {d.code} • {d.dbPoint}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 font-mono">
                            ৳ {(d.currentOutstandingBDT / 1000).toFixed(0)}k
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 2: Tagged Customers */}
                <div className="p-3 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-900 dark:text-purple-200">
                    <div className="flex items-center gap-1.5">
                      <Contact2 className="w-3.5 h-3.5 text-purple-600" />
                      <span>Tagged Customers ({taggedCustomers.length})</span>
                    </div>
                  </div>
                  {taggedCustomers.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No direct customers tagged.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {taggedCustomers.map((c) => (
                        <div
                          key={c.id}
                          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-purple-200/60 dark:border-purple-900/40 text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {c.code} • {c.customerType}
                            </div>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                            {c.channel === 'Direct Sales' ? 'Direct' : 'DB'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 3: Tagged Field Force Officers */}
                <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    <div className="flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Field Force Reps ({taggedFieldForce.length})</span>
                    </div>
                  </div>
                  {taggedFieldForce.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No sales officers assigned.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {taggedFieldForce.map((r) => (
                        <div
                          key={r.id}
                          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/60 dark:border-emerald-900/40 text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>
                            <div className="text-[10px] text-slate-400">{r.designation}</div>
                          </div>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              r.currentLocation?.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                            title={r.currentLocation?.isOnline ? 'Online' : 'Offline'}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

      {/* MODAL 1: Add New Hierarchy Node */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Create Hierarchy Node
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNode} className="space-y-3">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Parent Hierarchy Node
                </label>
                <select
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {flatNodes.map((fn) => (
                    <option key={fn.id} value={fn.id}>
                      {'\u00A0'.repeat(fn.level * 3)} {fn.level > 0 ? '↳ ' : ''}{fn.name} ({fn.type} - {fn.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Node Hierarchy Level
                  </label>
                  <select
                    value={newNodeType}
                    onChange={(e) => setNewNodeType(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-blue-600 dark:text-blue-400"
                  >
                    <option value="Territory">Territory</option>
                    <option value="Area">Area</option>
                    <option value="Region">Region</option>
                    <option value="Division">Division</option>
                    <option value="Business Unit">Business Unit</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Node Code (Unique Identifier)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TER-SYLHET-01"
                    value={newNodeCode}
                    onChange={(e) => setNewNodeCode(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Node Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sylhet Sadar Commercial Territory"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    In-Charge Person / Manager
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tarek Jamil (TSO)"
                    value={newNodeHead}
                    onChange={(e) => setNewNodeHead(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    placeholder="+880 1711-..."
                    value={newNodePhone}
                    onChange={(e) => setNewNodePhone(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Coverage Notes & Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Territory boundary, key markets, or regional hub remarks..."
                  value={newNodeNotes}
                  onChange={(e) => setNewNodeNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
                >
                  Create Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Existing Hierarchy Node */}
      {showEditModal && nodeToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Edit Hierarchy Node: {nodeToEdit.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Hierarchy Level Type
                  </label>
                  <select
                    value={nodeToEdit.type}
                    onChange={(e) =>
                      setNodeToEdit({ ...nodeToEdit, type: e.target.value as any })
                    }
                    disabled={nodeToEdit.type === 'Company'}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-blue-600 dark:text-blue-400"
                  >
                    <option value="Company">Company</option>
                    <option value="Business Unit">Business Unit</option>
                    <option value="Division">Division</option>
                    <option value="Region">Region</option>
                    <option value="Area">Area</option>
                    <option value="Territory">Territory</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Node Code
                  </label>
                  <input
                    type="text"
                    required
                    value={nodeToEdit.code}
                    onChange={(e) => setNodeToEdit({ ...nodeToEdit, code: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={nodeToEdit.name}
                  onChange={(e) => setNodeToEdit({ ...nodeToEdit, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    In-Charge Person / Manager
                  </label>
                  <input
                    type="text"
                    value={nodeToEdit.headPerson || ''}
                    onChange={(e) => setNodeToEdit({ ...nodeToEdit, headPerson: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={nodeToEdit.phone || ''}
                    onChange={(e) => setNodeToEdit({ ...nodeToEdit, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Coverage Description / Notes
                </label>
                <textarea
                  rows={2}
                  value={nodeToEdit.notes || ''}
                  onChange={(e) => setNodeToEdit({ ...nodeToEdit, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Tag Distributors, Customers & Field Force */}
      {showTagModal && nodeToTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Tag Entities to Hierarchy Node
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Node: <b className="text-slate-800 dark:text-slate-200">{nodeToTag.name}</b> ({nodeToTag.type} • {nodeToTag.code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTagModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Entity selector tabs */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setTagModalActiveTab('distributors')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    tagModalActiveTab === 'distributors'
                      ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Users2 className="w-3.5 h-3.5" />
                  <span>Distributors ({selectedDistIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTagModalActiveTab('customers')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    tagModalActiveTab === 'customers'
                      ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Contact2 className="w-3.5 h-3.5" />
                  <span>Customers ({selectedCustIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTagModalActiveTab('fieldforce')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    tagModalActiveTab === 'fieldforce'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Field Force ({selectedFfIds.length})</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter list..."
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-44"
                />
              </div>
            </div>

            {/* Entity Checkbox List */}
            <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 p-1">
              {/* Tab 1: Distributors */}
              {tagModalActiveTab === 'distributors' && (
                <>
                  {distributors
                    .filter(
                      (d) =>
                        d.name.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                        d.code.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                        d.district.toLowerCase().includes(tagSearchQuery.toLowerCase())
                    )
                    .map((d) => {
                      const isChecked = selectedDistIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className="flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDistIds((prev) => [...prev, d.id]);
                                } else {
                                  setSelectedDistIds((prev) => prev.filter((id) => id !== d.id));
                                }
                              }}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {d.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {d.code} • {d.dbPoint} • District: {d.district}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400">
                              ৳ {d.currentOutstandingBDT.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-slate-400 block font-sans">Outstanding</span>
                          </div>
                        </label>
                      );
                    })}
                </>
              )}

              {/* Tab 2: Customers */}
              {tagModalActiveTab === 'customers' && (
                <>
                  {customers
                    .filter(
                      (c) =>
                        c.name.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                        c.code.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                        c.customerType.toLowerCase().includes(tagSearchQuery.toLowerCase())
                    )
                    .map((c) => {
                      const isChecked = selectedCustIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCustIds((prev) => [...prev, c.id]);
                                } else {
                                  setSelectedCustIds((prev) => prev.filter((id) => id !== c.id));
                                }
                              }}
                              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                            />
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {c.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {c.code} • {c.customerType} • Channel: {c.channel}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              {c.pricingTier || 'Standard'}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                </>
              )}

              {/* Tab 3: Field Force */}
              {tagModalActiveTab === 'fieldforce' && (
                <>
                  {fieldForceReps
                    .filter(
                      (r) =>
                        r.name.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                        r.code.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                        r.designation.toLowerCase().includes(tagSearchQuery.toLowerCase())
                    )
                    .map((r) => {
                      const isChecked = selectedFfIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className="flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedFfIds((prev) => [...prev, r.id]);
                                } else {
                                  setSelectedFfIds((prev) => prev.filter((id) => id !== r.id));
                                }
                              }}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {r.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {r.code} • {r.designation}
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-[10px] text-slate-500 flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                r.currentLocation?.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            />
                            <span>{r.currentLocation?.address || r.lastKnownAddress || 'Active'}</span>
                          </div>
                        </label>
                      );
                    })}
                </>
              )}
            </div>

            {/* Quick summary footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">
                Total tagged: <b className="text-amber-600">{selectedDistIds.length} distributors</b>,{' '}
                <b className="text-purple-600">{selectedCustIds.length} customers</b>,{' '}
                <b className="text-emerald-600">{selectedFfIds.length} sales reps</b>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTagModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTags}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-xs"
                >
                  Save Entity Tags
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
