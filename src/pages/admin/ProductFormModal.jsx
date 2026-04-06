import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, Save, PackagePlus } from 'lucide-react';
// Using standard inputs for maximum control, but keeping the styling consistent
export default function ProductFormModal({ isOpen, onClose, onSave, product }) {
  const maxPhotos = 5;
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: '',
    brand: '',
    isFeatured: false,
    description: '',
    images: [],
    imageUrl: '',
    stock: ''
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [photoLimitMessage, setPhotoLimitMessage] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (product) {
      const existingImages = Array.isArray(product.images) && product.images.length > 0
        ? product.images.filter(Boolean).slice(0, 5)
        : [product.imageUrl].filter(Boolean);

      setFormData({
        ...product,
        images: existingImages,
        isFeatured: product.isFeatured === true || product.isFeatured === 'true'
      });
      setSelectedFiles([]);
      setFilePreviews([]);
      setPhotoLimitMessage('');
    } else {
      setFormData({ 
        name: '', price: '', category: '', brand: '', 
        isFeatured: false, description: '', images: [], imageUrl: '', stock: '' 
      });
      setSelectedFiles([]);
      setFilePreviews([]);
      setPhotoLimitMessage('');
    }
  }, [product, isOpen]);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setFilePreviews([]);
      return undefined;
    }

    const previewUrls = selectedFiles.map((file) => URL.createObjectURL(file));
    setFilePreviews(previewUrls);

    return () => {
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, [selectedFiles]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const keptImages = formData.images.filter(Boolean).slice(0, maxPhotos);

    const imageFiles = await Promise.all(
      selectedFiles.map((file) => {
        const fileReader = new FileReader();

        return new Promise((resolve, reject) => {
          fileReader.onload = () => resolve({
            fileData: fileReader.result,
            fileName: file.name,
            fileType: file.type || 'application/octet-stream'
          });
          fileReader.onerror = reject;
          fileReader.readAsDataURL(file);
        });
      })
    );

    const finalData = {
      ...formData,
      images: keptImages,
      imageUrl: keptImages[0] || '',
      price: parseFloat(formData.price),
      stock: parseInt(formData.stock, 10),
      imageFiles
    };

    onSave(finalData);
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    const remainingSlots = Math.max(0, maxPhotos - formData.images.length - selectedFiles.length);

    if (remainingSlots === 0) {
      setPhotoLimitMessage(`Remove a saved or new photo before adding more. The maximum is ${maxPhotos}.`);
      event.target.value = '';
      return;
    }

    const filesToAdd = files.slice(0, remainingSlots);

    if (files.length > remainingSlots) {
      setPhotoLimitMessage(`Only ${remainingSlots} more photo${remainingSlots === 1 ? '' : 's'} can be added. Maximum is ${maxPhotos}.`);
    } else {
      setPhotoLimitMessage('');
    }

    setSelectedFiles((currentFiles) => [...currentFiles, ...filesToAdd].slice(0, maxPhotos));
    event.target.value = '';
  };

  const handleRemoveSelectedFile = (indexToRemove) => {
    setSelectedFiles((currentFiles) => currentFiles.filter((_, index) => index !== indexToRemove));
    setPhotoLimitMessage('');
  };

  const handleRemoveSavedImage = (indexToRemove) => {
    setFormData((current) => {
      const nextImages = current.images.filter((_, index) => index !== indexToRemove);
      return {
        ...current,
        images: nextImages,
        imageUrl: nextImages[0] || ''
      };
    });
    setPhotoLimitMessage('');
  };

  const savedImages = formData.images.filter(Boolean).slice(0, maxPhotos);
  const remainingUploadSlots = Math.max(0, maxPhotos - savedImages.length - selectedFiles.length);
  const fileCountLabel = `${savedImages.length} saved photo${savedImages.length === 1 ? '' : 's'} • ${selectedFiles.length} new photo${selectedFiles.length === 1 ? '' : 's'}`;

  const fileNamesLabel = selectedFiles.length > 0
    ? selectedFiles.map((file) => file.name).join(', ')
    : 'Upload up to 5 product photos to store them on S3.';

  const uploadButtonLabel = remainingUploadSlots > 0
    ? `Upload ${remainingUploadSlots} More Photo${remainingUploadSlots === 1 ? '' : 's'}`
    : 'Photo Limit Reached';

  const openFilePicker = () => {
    if (remainingUploadSlots > 0) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="bg-zinc-900 p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <PackagePlus className="text-rose-500" />
            <h2 className="text-xl font-black uppercase italic tracking-tighter">
              {product ? 'Edit Product' : 'Add New Product'}
            </h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Product Name</label>
              <input 
                className="w-full mt-1 p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
            
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Price ($)</label>
              <input 
                type="number"
                step="0.01"
                className="w-full mt-1 p-3 bg-zinc-50 border border-zinc-100 rounded-xl outline-none"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Stock</label>
              <input 
                type="number"
                className="w-full mt-1 p-3 bg-zinc-50 border border-zinc-100 rounded-xl outline-none"
                value={formData.stock}
                onChange={(e) => setFormData({...formData, stock: e.target.value})}
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Brand</label>
              <input
                className="w-full mt-1 p-3 bg-zinc-50 border border-zinc-100 rounded-xl outline-none"
                value={formData.brand}
                onChange={(e) => setFormData({...formData, brand: e.target.value})}
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Category</label>
              <input 
                className="w-full mt-1 p-3 bg-zinc-50 border border-zinc-100 rounded-xl outline-none"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                required
              />
            </div>

            <div className="col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Description</label>
              <textarea 
                className="w-full mt-1 p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none transition-all min-h-[80px]"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                required
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Product Images (Max 5 Photos)</label>
              {savedImages.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Existing Photos</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {savedImages.map((imageSrc, index) => (
                      <div key={`${imageSrc}-${index}`} className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                        <img
                          src={imageSrc}
                          alt={`Saved product ${index + 1}`}
                          className="h-32 w-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white">
                          Saved
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSavedImage(index)}
                          className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-zinc-700 shadow transition hover:text-rose-600"
                          aria-label={`Remove saved photo ${index + 1}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={openFilePicker}
                disabled={remainingUploadSlots === 0}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700 transition hover:border-rose-400 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload size={16} />
                {uploadButtonLabel}
              </button>
              {filePreviews.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">New Photos</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {filePreviews.map((imageSrc, index) => (
                      <div key={`${imageSrc}-${index}`} className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                      <img
                        src={imageSrc}
                        alt={`Product preview ${index + 1}`}
                        className="h-32 w-full object-cover"
                      />
                      <div className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white">
                        New
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSelectedFile(index)}
                        className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-zinc-700 shadow transition hover:text-rose-600"
                        aria-label={`Remove new photo ${index + 1}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                {fileCountLabel}
              </p>
              <p className="mt-1 text-[10px] text-zinc-400">
                {remainingUploadSlots > 0 ? `${fileNamesLabel} You can still add ${remainingUploadSlots} more.` : 'Maximum photo count reached.'}
              </p>
              {photoLimitMessage ? (
                <p className="mt-2 text-[10px] font-bold text-amber-600">
                  {photoLimitMessage}
                </p>
              ) : null}
            </div>
            <div className="col-span-2 flex items-center gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
              <input 
                type="checkbox"
                id="isFeatured"
                className="w-5 h-5 accent-rose-500 rounded"
                checked={formData.isFeatured}
                onChange={(e) => setFormData({...formData, isFeatured: e.target.checked})}
              />
              <label htmlFor="isFeatured" className="text-xs font-bold uppercase tracking-widest text-zinc-700 cursor-pointer">
                Enable to feature this product
              </label>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-900 transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <Save size={16} /> {product ? 'Update Details' : 'Save Product'}
          </button>
        </form>
      </div>
    </div>
  );
}