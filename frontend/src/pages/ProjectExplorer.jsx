import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Upload, Check, X, History, Trash2 } from 'lucide-react';
import FileTreeNode from '../components/FileTree';
import { getFileIcon } from '../components/Icons';
import { useAuth } from '../context/AuthContext';

// Modals
import UploadModal from '../components/modals/UploadModal';
import RejectModal from '../components/modals/RejectModal';
import HistoryModal from '../components/modals/HistoryModal';
import ZipUploadModal from '../components/modals/ZipUploadModal';

const ProjectExplorer = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const [project, setProject] = useState(null);
    const [assets, setAssets] = useState([]);
    const [currentPath, setCurrentPath] = useState('/');

    // Modal States
    const [uploadModalAsset, setUploadModalAsset] = useState(null);
    const [showZipModal, setShowZipModal] = useState(false);
    const [rejectModalVersion, setRejectModalVersion] = useState(null);
    const [historyModalAsset, setHistoryModalAsset] = useState(null);

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        try {
            const [projRes, assetsRes] = await Promise.all([
                api.get(`/projects/${id}`),
                api.get(`/assets/project/${id}`)
            ]);
            setProject(projRes.data);
            setAssets(assetsRes.data || []);
        } catch (error) {
            console.error("Fetch error:", error);
            setAssets([]);
        }
    };

    // Build Tree Structure
    const tree = useMemo(() => {
        const root = { path: '/', children: {} };
        if (!Array.isArray(assets)) return root;

        assets.forEach(asset => {
            const folderPath = asset.folderPath || '/';
            const parts = folderPath === '/' ? [] : folderPath.split('/').filter(Boolean);
            let current = root;
            let currentPathBuild = '';

            parts.forEach(part => {
                currentPathBuild += '/' + part;
                // Correct path building: replace double slashes if any
                currentPathBuild = currentPathBuild.replace('//', '/');

                if (!current.children[part]) {
                    current.children[part] = { path: currentPathBuild, children: {} };
                }
                current = current.children[part];
            });
        });
        return root;
    }, [assets]);

    // Filter Assets by Path
    const currentAssets = useMemo(() => {
        if (!Array.isArray(assets)) return [];
        return assets.filter(a => {
            const aPath = (a.folderPath || '/').replace(/\\/g, '/');
            const cPath = (currentPath || '/').replace(/\\/g, '/');

            // Normalize: remove trailing slashes unless root
            const normA = aPath === '/' ? '/' : aPath.replace(/\/$/, '');
            const normC = cPath === '/' ? '/' : cPath.replace(/\/$/, '');

            return normA === normC;
        });
    }, [assets, currentPath]);

    const handleAccept = async (asset, version) => {
        try {
            await api.put(`/assets/${asset._id}/versions/${version.versionNumber}/status`, { status: 'approved' });
            fetchData();
        } catch (error) { alert('Failed to approve'); }
    };

    const handleDelete = async (assetId) => {
        if (!window.confirm('Are you sure you want to delete this asset permanently?')) return;
        try {
            await api.delete(`/assets/${assetId}`);
            setAssets(prev => prev.filter(a => a._id !== assetId)); // Optimistic UI update
        } catch (error) {
            alert('Failed to delete asset: ' + (error.response?.data?.message || error.message));
        }
    };

    const isDev = ['admin', 'developer'].includes(user.role);

    return (
        <div className="flex flex-col h-screen bg-white">
            {/* Header */}
            <div className="h-16 border-b flex items-center px-4 justify-between bg-gray-50">
                <div className="flex items-center gap-4">
                    <Link to="/" className="text-gray-500 hover:text-black"><ArrowLeft /></Link>
                    <h1 className="font-bold text-lg">{project?.name}</h1>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowZipModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 text-sm">
                        <Upload size={16} /> Import ZIP
                    </button>
                    <button onClick={() => setUploadModalAsset({ isNew: true, path: currentPath })} className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 text-sm">
                        <Upload size={16} /> Upload File
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar Tree */}
                <div className="w-64 border-r overflow-y-auto bg-gray-50 py-4">
                    <FileTreeNode
                        name="Root"
                        path="/"
                        children={tree.children}
                        onSelect={setCurrentPath}
                        selectedPath={currentPath}
                    />
                </div>

                {/* File List */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex items-center text-sm text-gray-500 mb-4">
                        Current Path: <span className="font-mono text-black ml-2 bg-gray-100 px-2 py-1 rounded">{currentPath}</span>
                    </div>

                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b text-gray-500 text-sm">
                                <th className="py-2 pl-2">Name</th>
                                <th className="py-2">Version</th>
                                <th className="py-2">Status</th>
                                <th className="py-2">Last Modified</th>
                                <th className="py-2 text-right pr-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentAssets.map(asset => {
                                const latestVer = asset.versions && asset.versions.length > 0
                                    ? asset.versions[asset.versions.length - 1]
                                    : { versionNumber: 0, status: 'unknown', createdAt: new Date() };

                                return (
                                    <tr key={asset._id} className="border-b hover:bg-gray-50 group">
                                        <td className="py-3 pl-2 flex items-center gap-2">
                                            {getFileIcon(asset.type)}
                                            <span className="font-medium">{asset.name}</span>
                                        </td>
                                        <td className="py-3">v{latestVer.versionNumber}</td>
                                        <td className="py-3">
                                            <span className={`text-xs px-2 py-1 rounded-full ${latestVer.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                    latestVer.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {latestVer.status}
                                            </span>
                                        </td>
                                        <td className="py-3 text-sm text-gray-500">{new Date(latestVer.createdAt).toLocaleDateString()}</td>
                                        <td className="py-3 text-right pr-2">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setUploadModalAsset(asset)} className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="Upload New Version">
                                                    <Upload size={16} />
                                                </button>

                                                {isDev && latestVer.status === 'pending' && (
                                                    <>
                                                        <button onClick={() => handleAccept(asset, latestVer)} className="text-green-600 hover:bg-green-50 p-1 rounded" title="Approve">
                                                            <Check size={16} />
                                                        </button>
                                                        <button onClick={() => setRejectModalVersion({ assetId: asset._id, versionNumber: latestVer.versionNumber })} className="text-red-600 hover:bg-red-50 p-1 rounded" title="Reject">
                                                            <X size={16} />
                                                        </button>
                                                    </>
                                                )}

                                                <button onClick={() => setHistoryModalAsset(asset)} className="text-gray-600 hover:bg-gray-100 p-1 rounded" title="History">
                                                    <History size={16} />
                                                </button>

                                                {isDev && (
                                                    <button onClick={() => handleDelete(asset._id)} className="text-red-600 hover:bg-red-50 p-1 rounded" title="Delete Asset">
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {currentAssets.length === 0 && (
                        <div className="text-center text-gray-400 mt-10">This folder is empty</div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {uploadModalAsset && (
                <UploadModal
                    asset={uploadModalAsset}
                    currentPath={currentPath}
                    projectId={id}
                    onClose={() => setUploadModalAsset(null)}
                    onSuccess={() => { setUploadModalAsset(null); fetchData(); }}
                />
            )}
            {showZipModal && (
                <ZipUploadModal
                    projectId={id}
                    onClose={() => setShowZipModal(false)}
                    onSuccess={() => { setShowZipModal(false); fetchData(); }}
                />
            )}
            {rejectModalVersion && (
                <RejectModal
                    data={rejectModalVersion}
                    onClose={() => setRejectModalVersion(null)}
                    onSuccess={() => { setRejectModalVersion(null); fetchData(); }}
                />
            )}
            {historyModalAsset && (
                <HistoryModal
                    asset={historyModalAsset}
                    onClose={() => setHistoryModalAsset(null)}
                />
            )}
        </div>
    );
};

export default ProjectExplorer;
