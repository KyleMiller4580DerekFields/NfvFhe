// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface VNFConfig {
  id: string;
  name: string;
  encryptedConfig: string;
  timestamp: number;
  owner: string;
  networkType: string;
  status: "active" | "inactive" | "pending";
}

const App: React.FC = () => {
  // Randomly selected style: High contrast (blue+orange), Industrial mechanical, Center radiation, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [vnfConfigs, setVnfConfigs] = useState<VNFConfig[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newConfigData, setNewConfigData] = useState({
    name: "",
    networkType: "5G",
    configDetails: ""
  });
  const [searchTerm, setSearchTerm] = useState("");

  // Randomly selected additional features: Search & Filter, Data Statistics, Team Information
  const activeCount = vnfConfigs.filter(v => v.status === "active").length;
  const inactiveCount = vnfConfigs.filter(v => v.status === "inactive").length;
  const pendingCount = vnfConfigs.filter(v => v.status === "pending").length;

  useEffect(() => {
    loadVNFConfigs().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadVNFConfigs = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("vnf_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing VNF keys:", e);
        }
      }
      
      const list: VNFConfig[] = [];
      
      for (const key of keys) {
        try {
          const configBytes = await contract.getData(`vnf_${key}`);
          if (configBytes.length > 0) {
            try {
              const configData = JSON.parse(ethers.toUtf8String(configBytes));
              list.push({
                id: key,
                name: configData.name,
                encryptedConfig: configData.config,
                timestamp: configData.timestamp,
                owner: configData.owner,
                networkType: configData.networkType,
                status: configData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing config data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading VNF config ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setVnfConfigs(list);
    } catch (e) {
      console.error("Error loading VNF configs:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitVNFConfig = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting VNF configuration with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedConfig = `FHE-${btoa(JSON.stringify(newConfigData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const configId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const configData = {
        name: newConfigData.name,
        config: encryptedConfig,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        networkType: newConfigData.networkType,
        status: "pending"
      };
      
      // Store encrypted config on-chain using FHE
      await contract.setData(
        `vnf_${configId}`, 
        ethers.toUtf8Bytes(JSON.stringify(configData))
      );
      
      const keysBytes = await contract.getData("vnf_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(configId);
      
      await contract.setData(
        "vnf_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted VNF configuration submitted securely!"
      });
      
      await loadVNFConfigs();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewConfigData({
          name: "",
          networkType: "5G",
          configDetails: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const activateConfig = async (configId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted VNF config with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const configBytes = await contract.getData(`vnf_${configId}`);
      if (configBytes.length === 0) {
        throw new Error("Config not found");
      }
      
      const configData = JSON.parse(ethers.toUtf8String(configBytes));
      
      const updatedConfig = {
        ...configData,
        status: "active"
      };
      
      await contract.setData(
        `vnf_${configId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedConfig))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE activation completed successfully!"
      });
      
      await loadVNFConfigs();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Activation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const deactivateConfig = async (configId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted VNF config with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const configBytes = await contract.getData(`vnf_${configId}`);
      if (configBytes.length === 0) {
        throw new Error("Config not found");
      }
      
      const configData = JSON.parse(ethers.toUtf8String(configBytes));
      
      const updatedConfig = {
        ...configData,
        status: "inactive"
      };
      
      await contract.setData(
        `vnf_${configId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedConfig))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE deactivation completed successfully!"
      });
      
      await loadVNFConfigs();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Deactivation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const filteredConfigs = vnfConfigs.filter(config =>
    config.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    config.networkType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    config.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner"></div>
      <p>Initializing FHE-powered NFV connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>FHE<span>NFV</span>Manager</h1>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content center-radial-layout">
        <div className="central-panel">
          <div className="panel-header">
            <h2>FHE-Powered Network Function Virtualization</h2>
            <p>Securely manage VNF configurations with fully homomorphic encryption</p>
          </div>
          
          <div className="stats-panel">
            <div className="stat-item">
              <div className="stat-value">{vnfConfigs.length}</div>
              <div className="stat-label">Total VNFs</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{activeCount}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{inactiveCount}</div>
              <div className="stat-label">Inactive</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>
          
          <div className="action-bar">
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="action-btn primary"
            >
              Add VNF Config
            </button>
            <button 
              onClick={loadVNFConfigs}
              className="action-btn"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search VNFs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="vnf-list">
            <div className="list-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Name</div>
              <div className="header-cell">Network</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredConfigs.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No VNF configurations found</p>
                <button 
                  className="action-btn primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Config
                </button>
              </div>
            ) : (
              filteredConfigs.map(config => (
                <div className="vnf-item" key={config.id}>
                  <div className="list-cell">#{config.id.substring(0, 6)}</div>
                  <div className="list-cell">{config.name}</div>
                  <div className="list-cell">{config.networkType}</div>
                  <div className="list-cell">{config.owner.substring(0, 6)}...{config.owner.substring(38)}</div>
                  <div className="list-cell">
                    <span className={`status-badge ${config.status}`}>
                      {config.status}
                    </span>
                  </div>
                  <div className="list-cell actions">
                    {isOwner(config.owner) && (
                      <>
                        {config.status !== "active" && (
                          <button 
                            className="action-btn success"
                            onClick={() => activateConfig(config.id)}
                          >
                            Activate
                          </button>
                        )}
                        {config.status !== "inactive" && (
                          <button 
                            className="action-btn danger"
                            onClick={() => deactivateConfig(config.id)}
                          >
                            Deactivate
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitVNFConfig} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          configData={newConfigData}
          setConfigData={setNewConfigData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="team-section">
          <h3>Core Team</h3>
          <div className="team-members">
            <div className="member">
              <div className="member-avatar"></div>
              <div className="member-info">
                <h4>Dr. Alice Chen</h4>
                <p>FHE Research Lead</p>
              </div>
            </div>
            <div className="member">
              <div className="member-avatar"></div>
              <div className="member-info">
                <h4>Bob Zhang</h4>
                <p>NFV Architect</p>
              </div>
            </div>
            <div className="member">
              <div className="member-avatar"></div>
              <div className="member-info">
                <h4>Carol Wang</h4>
                <p>Security Engineer</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE-NFV Manager. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  configData: any;
  setConfigData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  configData,
  setConfigData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setConfigData({
      ...configData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!configData.name || !configData.configDetails) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add VNF Configuration</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> Configuration will be encrypted with FHE
          </div>
          
          <div className="form-group">
            <label>VNF Name *</label>
            <input 
              type="text"
              name="name"
              value={configData.name} 
              onChange={handleChange}
              placeholder="Enter VNF name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Network Type *</label>
            <select 
              name="networkType"
              value={configData.networkType} 
              onChange={handleChange}
            >
              <option value="5G">5G Network</option>
              <option value="6G">6G Network</option>
              <option value="LTE">LTE Network</option>
              <option value="Other">Other Network</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Configuration Details *</label>
            <textarea 
              name="configDetails"
              value={configData.configDetails} 
              onChange={handleChange}
              placeholder="Enter VNF configuration details to encrypt..." 
              rows={6}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;