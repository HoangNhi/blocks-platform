using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Blocks.FileService.DTOs.Common;
using AutoDependencyRegistration.Attributes;
using Microsoft.AspNetCore.StaticFiles;


namespace Blocks.FileService.Services.CoreFeature.UploadFile
{
    [RegisterClassAsTransient]
    public class UploadFileService : IUploadFileService
    {

        private readonly IWebHostEnvironment _webHostEnvironment;
        public UploadFileService(IWebHostEnvironment webHostEnvironment)
        {
            _webHostEnvironment = webHostEnvironment;
        }

        public async Task Insert(List<IFormFile> files, string FolderName)
        {
            if (string.IsNullOrWhiteSpace(FolderName) || FolderName.Contains("..") || FolderName.Contains("/") || FolderName.Contains("\\"))
            {
                throw new BusinessException("Thư mục lưu trữ không hợp lệ");
            }

            var folderPath = Path.Combine(_webHostEnvironment.WebRootPath, "Files/Temp/" + FolderName);
            if (Directory.Exists(folderPath))
            {
                Directory.Delete(folderPath, recursive: true);
            }

            Directory.CreateDirectory(folderPath);

            string[] _fileValid = CommonConst._fileHinhAnhValid
                .Concat(CommonConst._fileVideoValid)
                .Concat(CommonConst._fileAudioValid)
                .Concat(CommonConst._fileTaiLieuValid)
                .ToArray();

            foreach (var file in files)
            {
                if (file.Length > 0 && _fileValid.Contains(Path.GetExtension(file.FileName).ToLower()))
                {
                    using (var stream = new FileStream(folderPath + "/" + file.FileName, FileMode.Create))
                    {
                        await file.CopyToAsync(stream);
                    }
                }
                else
                {
                    throw new BusinessException("Upload file không thành công");
                }
            }
        }

        public async Task<List<ModelAttachment>> InsertAndReturn(List<IFormFile> files, string folderName)
        {
            // Step 1: Upload to temp folder (reuses existing validation + saving logic)
            await Insert(files, folderName);

            // Step 2: Move from temp to permanent and return file metadata
            var embedId = Guid.NewGuid();
            var servicePath = "sar-embeds";
            return UploadData(embedId, servicePath, "sar-embeds", folderName);
        }

        public List<ModelAttachment> UploadData(object lienKetId, string servicePath, string folderName, string tempFolder)
        {
            if (string.IsNullOrWhiteSpace(tempFolder) || tempFolder.Contains("..") || tempFolder.Contains("/") || tempFolder.Contains("\\"))
            {
                throw new BusinessException("Thư mục lưu trữ tạm không hợp lệ");
            }
            if (string.IsNullOrWhiteSpace(folderName) || folderName.Contains("..") || folderName.Contains("/") || folderName.Contains("\\"))
            {
                throw new BusinessException("Thư mục lưu trữ chính không hợp lệ");
            }

            List<ModelAttachment> result = new List<ModelAttachment>();
            string sourceDirPath = Path.Combine(_webHostEnvironment.WebRootPath, "Files", "Temp", tempFolder);
            string destinationDirPath = Path.Combine(_webHostEnvironment.WebRootPath, servicePath, folderName, lienKetId.ToString());
            string relativeDirPath = servicePath + "/" + folderName + "/" + lienKetId.ToString();

            result = SyncUploadFile(sourceDirPath, destinationDirPath, relativeDirPath);

            return result;
        }

        public bool DeleteData(IEnumerable<string> filePaths)
        {
            if (filePaths == null || !filePaths.Any())
            {
                return true;
            }

            bool allSuccess = true;
            foreach (var filePath in filePaths)
            {
                try
                {
                    // Construct absolute source path
                    string sourcePath = Path.Combine(_webHostEnvironment.WebRootPath, filePath);

                    // Check if source file exists
                    if (!File.Exists(sourcePath))
                    {
                        allSuccess = false;
                        continue;
                    }

                    var pathSegments = filePath.Split(new char[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries);
                    string serviceName = pathSegments.FirstOrDefault() ?? "Common";

                    // Assumes filePath format like "Service/Module/Id/File.ext"
                    string relateId = pathSegments.Length >= 2 ? pathSegments[pathSegments.Length - 2] : "Common";

                    // Construct absolute destination path
                    string destinationDirPath = Path.Combine(_webHostEnvironment.WebRootPath, "Deleted", serviceName, relateId);

                    // Create destination directory if it doesn't exist
                    if (!Directory.Exists(destinationDirPath))
                    {
                        Directory.CreateDirectory(destinationDirPath);
                    }

                    // Get file info
                    FileInfo info = new FileInfo(sourcePath);
                    string fileName = Path.GetFileNameWithoutExtension(sourcePath);
                    string extension = info.Extension;

                    // Handle file name collisions
                    string destFilePath = Path.Combine(destinationDirPath, fileName + extension);
                    int counter = 1;
                    while (File.Exists(destFilePath))
                    {
                        destFilePath = Path.Combine(destinationDirPath, $"{fileName}({counter}){extension}");
                        counter++;
                    }

                    // Move file
                    File.Move(sourcePath, destFilePath);
                }
                catch (Exception)
                {
                    allSuccess = false;
                }
            }

            return allSuccess;
        }

        public string UploadAvatar(string folderUploadId, string oldImage)
        {
            string path = oldImage;
            string folderUploadPath = Path.Combine(_webHostEnvironment.WebRootPath, "Files", "Temp", folderUploadId);
            if (Directory.Exists(folderUploadPath))
            {
                string[] arrFiles = Directory.GetFiles(folderUploadPath);
                if (arrFiles.Count() > 0) //có đính kèm
                {
                    FileInfo info = new FileInfo(arrFiles[0]);
                    string fileName = Guid.NewGuid().ToString() + info.Extension;
                    string avataPath = Path.Combine(_webHostEnvironment.WebRootPath, "System", "Avatar");
                    //Kiểm tra nếu thư mục chưa tồn tại thì tạo mới.
                    if (!Directory.Exists(avataPath))
                    {
                        Directory.CreateDirectory(avataPath);
                    }

                    //Xóa ảnh cũ nếu tồn tại
                    if (File.Exists(Path.Combine(avataPath, oldImage)))
                    {
                        File.Delete(Path.Combine(avataPath, oldImage));
                    }

                    //Copy ảnh mới
                    File.Move(arrFiles[0], Path.Combine(avataPath, fileName), true);
                    path = "System/Avatar/" + fileName;
                }

                //Xóa thư mục tạm.
                Directory.Delete(folderUploadPath, true);
            }

            return path;
        }
        #region Private methods
        private string GetContentType(string filePath)
        {
            var provider = new FileExtensionContentTypeProvider();
            if (provider.TryGetContentType(filePath, out var contentType))
            {
                return contentType;
            }

            return "application/octet-stream";
        }

        List<ModelAttachment> SyncUploadFile(string sourceDirPath, string destinationDirPath, string relativeDirPath = "")
        {
            try
            {
                List<ModelAttachment> lstAttachment = new List<ModelAttachment>();

                //copy file
                if (Directory.Exists(sourceDirPath))
                {
                    string[] arrFiles = Directory.GetFiles(sourceDirPath);
                    if (arrFiles.Count() > 0) //có đính kèm
                    {
                        //Kiểm tra nếu thư mục chưa tồn tại thì tạo mới.
                        if (!Directory.Exists(destinationDirPath))
                        {
                            Directory.CreateDirectory(destinationDirPath);
                        }
                        //Copy file qua thư mục mới
                        foreach (string f in arrFiles)
                        {
                            FileInfo info = new FileInfo(f);
                            string tempFileName = Path.GetFileNameWithoutExtension(f); // Tên gốc để lưu vào DB (Original name)
                            
                            // Sử dụng UUID làm tên file vật lý tĩnh trên đĩa để chống bypass đuôi và chống ghi đè
                            string uuidFileName = Guid.NewGuid().ToString() + info.Extension;
                            string destDirPath = Path.Combine(destinationDirPath, uuidFileName);

                            //Copy file tới đường dẫn mới (mang tên UUID)
                            if (File.Exists(f))
                            {
                                File.Copy(f, destDirPath, true);
                                // Lưu thông tin Tên Gốc (FileName) và URL mới cho database lưu trữ
                                ModelAttachment tepDinhKem = new ModelAttachment();
                                tepDinhKem.FileName = tempFileName;
                                tepDinhKem.FileSize = info.Length;
                                tepDinhKem.FileExtension = info.Extension;
                                tepDinhKem.FileUrl = relativeDirPath + "/" + uuidFileName; // Logical Path chứa UUID

                                lstAttachment.Add(tepDinhKem);
                            }
                        }
                    }
                    //Xóa thư mục tạm.
                    Directory.Delete(sourceDirPath, true);
                }

                return lstAttachment;
            }
            catch (Exception)
            {
                throw;
            }
        }



        #endregion
    }
}
