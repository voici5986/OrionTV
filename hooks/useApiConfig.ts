import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/services/api';

export interface ApiConfigStatus {
  isConfigured: boolean;
  isValidating: boolean;
  isValid: boolean | null;
  error: string | null;
  needsConfiguration: boolean;
}

export const useApiConfig = () => {
  const { apiBaseUrl, serverConfig, isLoadingServerConfig } = useSettingsStore();
  const [validationState, setValidationState] = useState<{
    isValidating: boolean;
    isValid: boolean | null;
    error: string | null;
  }>({
    isValidating: false,
    isValid: null,
    error: null,
  });

  const isConfigured = Boolean(apiBaseUrl && apiBaseUrl.trim());
  const needsConfiguration = !isConfigured;

  // Validate API configuration when it changes
  useEffect(() => {
    if (!isConfigured) {
      setValidationState({
        isValidating: false,
        isValid: false,
        error: null,
      });
      return;
    }

    const validateConfig = async () => {
      setValidationState(prev => ({ ...prev, isValidating: true, error: null }));
      
      try {
        await api.getServerConfig();
        setValidationState({
          isValidating: false,
          isValid: true,
          error: null,
        });
      } catch (error) {
        let errorMessage = '服务器连接失败';
        
        if (error instanceof Error) {
          switch (error.message) {
            case 'API_URL_NOT_SET':
              errorMessage = 'API地址未设置';
              break;
            case 'UNAUTHORIZED':
              errorMessage = '服务器认证失败';
              break;
            default:
              if (error.message.includes('Network')) {
                errorMessage = '网络连接失败，请检查网络或服务器地址';
              } else if (error.message.includes('timeout')) {
                errorMessage = '连接超时，请检查服务器地址';
              } else if (error.message.includes('404')) {
                errorMessage = '服务器地址无效，请检查API路径';
              } else if (error.message.includes('500')) {
                errorMessage = '服务器内部错误';
              }
              break;
          }
        }
        
        setValidationState({
          isValidating: false,
          isValid: false,
          error: errorMessage,
        });
      }
    };

    // Only validate if not already loading server config
    if (!isLoadingServerConfig) {
      validateConfig();
    }
  }, [apiBaseUrl, isConfigured, isLoadingServerConfig]);

  // Reset validation when server config loading state changes
  useEffect(() => {
    if (isLoadingServerConfig) {
      setValidationState(prev => ({ ...prev, isValidating: true, error: null }));
    }
  }, [isLoadingServerConfig]);

  // Update validation state based on server config
  useEffect(() => {
    if (!isLoadingServerConfig && isConfigured) {
      if (serverConfig) {
        setValidationState(prev => ({ ...prev, isValid: true, error: null }));
      } else {
        setValidationState(prev => ({ 
          ...prev, 
          isValid: false, 
          error: prev.error || '无法获取服务器配置' 
        }));
      }
    }
  }, [serverConfig, isLoadingServerConfig, isConfigured]);

  const status: ApiConfigStatus = {
    isConfigured,
    isValidating: validationState.isValidating || isLoadingServerConfig,
    isValid: validationState.isValid,
    error: validationState.error,
    needsConfiguration,
  };

  return status;
};

export const getApiConfigErrorMessage = (status: ApiConfigStatus): string => {
  if (status.needsConfiguration) {
    return '请点击右上角设置按钮，配置您的服务器地址';
  }
  
  if (status.error) {
    return status.error;
  }
  
  if (status.isValidating) {
    return '正在验证服务器配置...';
  }
  
  if (status.isValid === false) {
    return '服务器配置验证失败，请检查设置';
  }
  
  return '加载失败，请重试';
};